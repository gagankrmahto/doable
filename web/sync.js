/* Doable — cloud sync.
 * Offline-first: the app always reads and writes local data. This layer diffs local records against
 * what was last synced, pushes changes, and merges remote changes in per record (last write wins,
 * ordered by the server's clock). Deletes are synced as tombstones. Only one browser tab syncs at a
 * time (Web Locks); other tabs follow through localStorage. */
(function (global) {
  'use strict';

  const DELETED = '~deleted~';
  const OVERLAP_MS = 5000; // re-read a few seconds back on each pull so late commits are never missed

  // Key-sorted JSON so records compare equal no matter how Postgres reorders jsonb keys.
  function stable(v) {
    if (v === null || v === undefined || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  const kindOf = id => (id.includes(':') ? id.slice(0, id.indexOf(':')) : id);

  /* ---------- Engine (no DOM, no Supabase — unit-testable) ----------
   * backend: { fetchSince(isoOrNull) -> rows, upsert(rows), subscribe(onRows, onState) -> unsubscribe }
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

  /* ---------- Supabase backend ---------- */
  const TABLE = 'doable_records';
  function supabaseBackend(client, userId) {
    return {
      async fetchSince(since) {
        const out = [];
        const page = 1000;
        for (let from = 0; ; from += page) {
          let q = client.from(TABLE).select('id,kind,data,deleted,updated_at')
            .order('updated_at', { ascending: true }).order('id', { ascending: true })
            .range(from, from + page - 1);
          if (since) q = q.gte('updated_at', since);
          const { data, error } = await q;
          if (error) throw error;
          out.push(...data);
          if (data.length < page) return out;
        }
      },
      async upsert(rows) {
        for (let i = 0; i < rows.length; i += 400) {
          const chunk = rows.slice(i, i + 400).map(r => ({ user_id: userId, id: r.id, kind: r.kind, data: r.data, deleted: r.deleted }));
          const { error } = await client.from(TABLE).upsert(chunk, { onConflict: 'user_id,id' });
          if (error) throw error;
        }
      },
      subscribe(onRows, onState) {
        const channel = client.channel(`doable:${userId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` },
            p => { if (p.new && p.new.id) onRows([p.new]); })
          .subscribe(s => onState(s));
        return () => client.removeChannel(channel);
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
    status: 'unconfigured', // unconfigured | signed-out | syncing | synced | offline | error | idle
    user: null,
    lastSync: 0,
    error: null,
    leader: true,
  };
  let client = null;
  let engine = null;
  let appHooks = null;
  let releaseLock = null;
  let lockAbort = null;
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('doable-sync') : null;

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
      engine = createEngine({ backend: supabaseBackend(client, user.id), store: localStore, app: appHooks, onStatus: publish });
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
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !global.supabase) { publish('unconfigured'); return; }
    Sync.configured = true;
    client = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'doable-auth' },
    });
    publish('signed-out');
    client.auth.onAuthStateChange((event, session) => {
      // Defer: Supabase recommends not calling its APIs inside this callback synchronously.
      setTimeout(() => {
        if (event === 'PASSWORD_RECOVERY') hooks.onPasswordRecovery();
        const user = session ? session.user : null;
        if ((user && user.id) !== (Sync.user && Sync.user.id)) {
          end();
          Sync.user = user;
          if (user) begin(user); else publish('signed-out');
        }
        if (/access_token=|error_description=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
        hooks.onSyncStatus();
      }, 0);
    });
    addEventListener('online', () => Sync.syncNow());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.syncNow(); });
    setInterval(() => { if (document.visibilityState === 'visible') Sync.syncNow(); }, 120000);
  };

  Sync.changed = () => { if (engine) engine.changed(); };
  Sync.syncNow = () => (engine ? engine.syncNow() : Promise.resolve());
  Sync.signIn = (email, password) => client.auth.signInWithPassword({ email, password });
  Sync.signUp = (email, password) => client.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
  Sync.resetPassword = email => client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
  Sync.updatePassword = password => client.auth.updateUser({ password });
  // Signed-in user's token, for Doable's own server functions (e.g. the calendar feed proxy)
  Sync.accessToken = async () => {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return (data && data.session && data.session.access_token) || null;
  };
  Sync.signOut = async () => {
    end();
    localStore.clear();
    await client.auth.signOut();
  };

  global.DoableSync = Sync;
  global.DoableSyncEngine = { createEngine, stable, DELETED };
})(typeof window !== 'undefined' ? window : globalThis);
