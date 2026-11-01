/* Doable — cloud sync.
 * Offline-first: the app always reads and writes local data. This layer diffs local records against
 * what was last synced, pushes changes, and merges remote changes in per record (last write wins,
 * ordered by the server's clock). Deletes are synced as tombstones. Only one browser tab syncs at a
 * time (Web Locks); other tabs follow through localStorage. */
(function (global) {
  'use strict';

  const DELETED = '~deleted~';
  const OVERLAP_MS = 5000; // re-read a few seconds back on each pull so late commits are never missed

  // Key-sorted JSON so records compare equal however the server or JSON round-trips order their keys.
  function stable(v) {
    if (v === null || v === undefined || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  const kindOf = id => (id.includes(':') ? id.slice(0, id.indexOf(':')) : id);

  /* ---------- Engine (no DOM, no server SDK — unit-testable) ----------
   * backend: { fetchSince(isoOrNull) -> rows, upsert(rows), subscribe(onRows, onState, sinceIsoOrNull) -> unsubscribe }
   * store:   { load() -> meta|null, save(meta), clear() }
   * app:     { records() -> Map<id,{kind,data}>, apply(rows), replaceAll(rows), isPristine(), chooseFirstSync() -> 'merge'|'replace' }
   * rows:    { id, kind, data, deleted, updated_at } */
  function createEngine({ backend, store, app, onStatus = () => {}, now = () => Date.now(), retryMs = 15000 }) {
    let meta = null;
    let running = false;
    let queueTail = Promise.resolve();
    let pushTimer = 0;
    let retryTimer = 0;
    let unsubscribe = null;
    let status = 'idle';

    const setStatus = (s, error) => { status = s; onStatus(s, { lastSync: meta && meta.lastSync, error }); };
    const saveMeta = () => store.save(meta);

    function dirtyRows() {
      const local = app.records();
      const rows = [];
      for (const [id, rec] of local) {
        const s = stable(rec.data);
        if (meta.base[id] !== s) rows.push({ id, kind: rec.kind, data: rec.data, deleted: false, s });
      }
      for (const id of Object.keys(meta.base)) {
        if (!local.has(id) && meta.base[id] !== DELETED) rows.push({ id, kind: kindOf(id), data: null, deleted: true, s: DELETED });
      }
      return rows;
    }

    function advanceCursor(rows) {
      let max = meta.cursor ? Date.parse(meta.cursor) : 0;
      for (const r of rows) { const t = Date.parse(r.updated_at); if (t > max) max = t; }
      if (max) meta.cursor = new Date(max).toISOString();
    }

    function ingest(rows) {
      if (!rows || !rows.length) return;
      rows = [...rows].sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at));
      const local = app.records();
      const apply = [];
      for (const r of rows) {
        const remote = r.deleted ? DELETED : stable(r.data);
        const mine = local.has(r.id) ? stable(local.get(r.id).data) : DELETED;
        if (r.kind === 'stats') { // counters merge (max per day) instead of conflicting
          meta.base[r.id] = remote;
          if (!r.deleted && mine !== remote) apply.push(r);
          continue;
        }
        const base = meta.base[r.id];
        // Unknown to base: a local-only record is dirty, except shared settings where the cloud wins on first contact.
        const dirty = base === undefined ? (mine !== DELETED && r.id !== 'settings') : mine !== base;
        if (dirty && mine !== remote) continue; // our newer local edit wins; it is pushed next
        meta.base[r.id] = remote;
        if (mine !== remote) apply.push(r);
      }
      advanceCursor(rows);
      if (apply.length) app.apply(apply);
      saveMeta();
    }

    async function pull() {
      const since = meta.cursor ? new Date(Date.parse(meta.cursor) - OVERLAP_MS).toISOString() : null;
      ingest(await backend.fetchSince(since));
    }

    async function pushAll() {
      for (let i = 0; i < 5; i++) { // re-check: the user may have edited while a push was in flight
        const rows = dirtyRows();
        if (!rows.length) return;
        await backend.upsert(rows.map(({ s, ...r }) => r));
        for (const r of rows) meta.base[r.id] = r.s;
        saveMeta();
      }
    }

    async function firstSync() {
      const remote = await backend.fetchSince(null);
      const hasRemote = remote.some(r => !r.deleted && (r.kind === 'task' || r.kind === 'list'));
      if (hasRemote) {
        const choice = app.isPristine() ? 'replace' : await app.chooseFirstSync();
        if (choice === 'replace') {
          app.replaceAll(remote.filter(r => !r.deleted));
          for (const r of remote) meta.base[r.id] = r.deleted ? DELETED : stable(r.data);
          advanceCursor(remote);
          saveMeta();
          return;
        }
      }
      ingest(remote);
    }

    // All network work runs one task at a time, in order.
    function enqueue(fn, { quiet } = {}) {
      queueTail = queueTail.then(async () => {
        if (!running) return;
        if (!quiet) setStatus('syncing');
        try {
          await fn();
          meta.lastSync = now();
          saveMeta();
          setStatus('synced');
        } catch (e) {
          if (!running) return; // finished after sign-out: nothing to report or retry
          const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
          setStatus(offline ? 'offline' : 'error', e && (e.message || String(e)));
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => syncNow(), retryMs);
        }
      });
      return queueTail;
    }

    async function start(userId) {
      const saved = store.load();
      meta = saved && saved.userId === userId ? saved : { userId, base: {}, cursor: null, lastSync: 0 };
      meta.base = meta.base || {};
      running = true;
      const fresh = !meta.cursor && !Object.keys(meta.base).length;
      await enqueue(async () => { if (fresh) await firstSync(); else await pull(); await pushAll(); });
      unsubscribe = backend.subscribe(
        rows => enqueue(() => ingest(rows), { quiet: true }),
        state => { if (state === 'SUBSCRIBED') syncNow(); },
        meta.cursor, // the last server time seen, so live updates never depend on this device's clock
      );
    }

    function stop() {
      running = false;
      clearTimeout(pushTimer);
      clearTimeout(retryTimer);
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      setStatus('idle');
    }

    function changed() {
      if (!running) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => enqueue(pushAll), 600);
    }

    function syncNow() {
      if (!running) return Promise.resolve();
      clearTimeout(retryTimer);
      return enqueue(async () => { await pull(); await pushAll(); });
    }

    return {
      start, stop, changed, syncNow,
      flush: () => queueTail,
      get status() { return status; },
      get meta() { return meta; },
    };
  }

  /* ---------- Firestore backend ----------
   * users/{uid}/records/{id} = { kind, json, deleted, updated_at }
   * `json` is the record as JSON text (null once deleted), so any shape round-trips exactly;
   * `updated_at` is always the server's clock (the security rules enforce it), which orders pulls. */
  function firestoreBackend(fb, db, uid, { timeoutMs = 20000 } = {}) {
    const col = fb.collection(db, 'users', uid, 'records');
    const toRow = d => {
      const x = d.data();
      return { id: d.id, kind: x.kind, data: x.json ? JSON.parse(x.json) : null, deleted: !!x.deleted, updated_at: x.updated_at.toDate().toISOString() };
    };
    // Firestore waits quietly while offline; give up after a while so the engine can report it and retry
    const timed = (p, what) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} timed out (offline?)`)), timeoutMs))]);
    return {
      async fetchSince(since) {
        const q = since ? fb.query(col, fb.where('updated_at', '>=', fb.Timestamp.fromMillis(Date.parse(since))), fb.orderBy('updated_at')) : col;
        const snap = await timed(fb.getDocsFromServer(q), 'Download'); // never the local cache: an empty cache must not look like an empty account
        return snap.docs.filter(d => d.data().updated_at).map(toRow);
      },
      async upsert(rows) {
        for (let i = 0; i < rows.length; i += 450) { // a batch holds at most 500 writes
          const batch = fb.writeBatch(db);
          for (const r of rows.slice(i, i + 450)) {
            batch.set(fb.doc(col, r.id), { kind: r.kind, json: r.deleted ? null : JSON.stringify(r.data), deleted: !!r.deleted, updated_at: fb.serverTimestamp() });
          }
          await timed(batch.commit(), 'Upload');
        }
      },
      subscribe(onRows, onState, since) {
        let first = true;
        const from = since ? Date.parse(since) - OVERLAP_MS : Date.now() - 3600000; // a new account: allow for a skewed clock
        const recent = fb.query(col, fb.where('updated_at', '>=', fb.Timestamp.fromMillis(from)));
        return fb.onSnapshot(recent, snap => {
          if (first) { first = false; onState('SUBSCRIBED'); return; } // the pull that follows covers everything up to now
          const rows = snap.docChanges()
            .filter(c => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites && c.doc.data().updated_at)
            .map(c => toRow(c.doc));
          if (rows.length) onRows(rows);
        }, () => onState('CHANNEL_ERROR'));
      },
    };
  }

  /* ---------- Browser glue ---------- */
  const META_KEY = 'doable:sync';
  const localStore = {
    load() { try { return JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch { return null; } },
    save(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* storage full */ } },
    clear() { try { localStorage.removeItem(META_KEY); } catch { /* ignore */ } },
  };

  const Sync = {
    configured: false,
    status: 'unconfigured', // unconfigured | restoring | signed-out | syncing | synced | offline | error | idle
    user: null,
    lastSync: 0,
    error: null,
    leader: true,
  };
  let fb = null;
  let auth = null;
  let db = null;
  let engine = null;
  let appHooks = null;
  let releaseLock = null;
  let lockAbort = null;
  const channel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('doable-sync') : null; // tabs only

  function publish(status, info = {}) {
    Sync.status = status;
    if (info.lastSync) Sync.lastSync = info.lastSync;
    Sync.error = info.error || null;
    if (Sync.leader && channel) channel.postMessage({ status, lastSync: Sync.lastSync, error: Sync.error });
    if (appHooks) appHooks.onSyncStatus();
  }
  if (channel) channel.onmessage = e => {
    if (Sync.leader || !Sync.user) return;
    Sync.status = e.data.status; Sync.lastSync = e.data.lastSync; Sync.error = e.data.error;
    if (appHooks) appHooks.onSyncStatus();
  };

  function redirectUrl() {
    const cfg = global.DOABLE_CONFIG || {};
    if (cfg.siteUrl) return cfg.siteUrl;
    const isWebHost = /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    return isWebHost ? location.origin + location.pathname : undefined;
  }

  function begin(user) {
    publish('syncing');
    const run = async () => {
      Sync.leader = true;
      engine = createEngine({ backend: firestoreBackend(fb, db, user.id), store: localStore, app: appHooks, onStatus: publish });
      await engine.start(user.id);
      await new Promise(res => { releaseLock = res; }); // hold leadership until sign-out / tab close
    };
    if (global.navigator && navigator.locks) {
      Sync.leader = false;
      lockAbort = new AbortController();
      navigator.locks.request('doable-sync-leader', { signal: lockAbort.signal }, run).catch(() => {});
    } else run();
  }
  function end() {
    if (engine) { engine.stop(); engine = null; }
    if (releaseLock) { releaseLock(); releaseLock = null; }
    if (lockAbort) { lockAbort.abort(); lockAbort = null; }
    Sync.leader = true;
  }

  Sync.init = function init(hooks) {
    appHooks = hooks;
    const cfg = global.DOABLE_CONFIG || {};
    fb = global.firebaseSdk;
    if (!cfg.firebase || !cfg.firebase.apiKey || !fb) { publish('unconfigured'); return; }
    Sync.configured = true;
    const app = fb.initializeApp(cfg.firebase);
    auth = fb.getAuth(app);
    db = fb.getFirestore(app);
    publish('restoring'); // Firebase reads the saved session before its first callback; the login wall waits quietly
    // If that first callback never comes (an Android WebView whose storage read hangs after an update), stop
    // waiting: show the sign-in form. A session that restores later still opens the app through the callback.
    let answered = false;
    setTimeout(() => { if (!answered && Sync.status === 'restoring') publish('signed-out'); }, 6000);
    fb.onAuthStateChanged(auth, u => {
      answered = true;
      const user = u ? { id: u.uid, email: u.email, providers: u.providerData.map(p => p.providerId) } : null;
      if ((user && user.id) !== (Sync.user && Sync.user.id)) {
        end();
        Sync.user = user;
        if (user) begin(user); else publish('signed-out');
      } else Sync.user = user; // same person, e.g. a password was just added
      hooks.onSyncStatus();
    });
    addEventListener('online', () => Sync.syncNow());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.syncNow(); });
    setInterval(() => { if (document.visibilityState === 'visible') Sync.syncNow(); }, 120000);
  };

  // Auth calls resolve to { data, error } so the screens can show friendly messages
  const attempt = async fn => { try { return { data: await fn(), error: null }; } catch (error) { return { data: null, error }; } };
  const isNativeApp = () => !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());

  Sync.changed = () => { if (engine) engine.changed(); };
  Sync.syncNow = () => (engine ? engine.syncNow() : Promise.resolve());
  Sync.signIn = (email, password) => attempt(() => fb.signInWithEmailAndPassword(auth, email, password));
  Sync.signUp = (email, password) => attempt(async () => {
    const cred = await fb.createUserWithEmailAndPassword(auth, email, password);
    fb.sendEmailVerification(cred.user).catch(() => {}); // a verified email lets Google sign-in join this same account later
    return cred;
  });
  // On the website Google opens in a popup. In the Android app Google blocks web sign-in pages, so the
  // native Firebase Authentication plugin shows the system account picker and hands back a credential.
  const nativeAuth = () => (isNativeApp() ? global.Capacitor.registerPlugin('FirebaseAuthentication') : null);
  Sync.canUseGoogle = () => true;
  Sync.signInWithGoogle = () => attempt(async () => {
    const plugin = nativeAuth();
    if (!plugin) return fb.signInWithPopup(auth, new fb.GoogleAuthProvider());
    const r = await plugin.signInWithGoogle();
    const idToken = r && r.credential && r.credential.idToken;
    if (!idToken) throw Object.assign(new Error('Google sign-in was cancelled.'), { code: 'auth/popup-closed-by-user' });
    return fb.signInWithCredential(auth, fb.GoogleAuthProvider.credential(idToken, r.credential.accessToken || null));
  });
  Sync.resetPassword = email => attempt(() => fb.sendPasswordResetEmail(auth, email, redirectUrl() ? { url: redirectUrl() } : undefined));
  // Lets an account created with Google also sign in with email + password (for the Android app)
  Sync.addPassword = password => attempt(async () => {
    await fb.linkWithCredential(auth.currentUser, fb.EmailAuthProvider.credential(auth.currentUser.email, password));
    const u = auth.currentUser;
    Sync.user = { id: u.uid, email: u.email, providers: u.providerData.map(p => p.providerId) };
  });
  // Passcode-shared snapshots live at shared/{id}: anyone may read the ciphertext, only the owner writes it
  Sync.publishShare = async (id, sealed) => {
    if (!auth || !auth.currentUser) throw new Error('Sign in to share');
    await fb.setDoc(fb.doc(db, 'shared', id), { owner: auth.currentUser.uid, ...sealed, updated_at: fb.serverTimestamp() });
  };
  Sync.removeShare = async id => { if (auth && auth.currentUser) await fb.deleteDoc(fb.doc(db, 'shared', id)); };
  // Signed-in user's ID token, for Doable's own server functions (the calendar feed proxy)
  Sync.accessToken = async () => (auth && auth.currentUser ? auth.currentUser.getIdToken() : null);
  Sync.signOut = async () => {
    end();
    localStore.clear();
    await fb.signOut(auth);
  };

  global.DoableSync = Sync;
  global.DoableSyncEngine = { createEngine, firestoreBackend, stable, DELETED };
})(typeof window !== 'undefined' ? window : globalThis);
