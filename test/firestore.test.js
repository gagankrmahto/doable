// Firestore sync backend tests with an in-memory stand-in for the Firebase SDK: node test/firestore.test.js
const assert = require('assert');
require('../web/sync.js');
const { createEngine, firestoreBackend } = globalThis.DoableSyncEngine;

// --- Fake Firestore server shared by devices; each device gets its own SDK-shaped facade ---
function createServer() {
  const docs = new Map(); // full path -> stored fields
  const listeners = new Set();
  let clock = Date.UTC(2026, 9, 31);
  class Timestamp {
    constructor(ms) { this.ms = ms; }
    static fromMillis(ms) { return new Timestamp(ms); }
    toDate() { return new Date(this.ms); }
  }
  const SERVER_TIME = Symbol('serverTimestamp');
  const snapDoc = (path, data, pending = false) => ({ id: path.split('/').pop(), data: () => data, metadata: { hasPendingWrites: pending } });
  const matches = (q, path, data) => {
    const col = q.col || q;
    if (path.slice(0, path.lastIndexOf('/')) !== col.path) return false;
    return (q.cons || []).every(c => !c.field || (data[c.field] && data[c.field].ms >= c.val.ms));
  };
  function sdk(device) {
    return {
      Timestamp,
      collection: (db, ...segs) => ({ path: segs.join('/') }),
      doc: (col, id) => ({ path: `${col.path}/${id}` }),
      where: (field, op, val) => { assert.strictEqual(op, '>='); return { field, val }; },
      orderBy: field => ({ orderBy: field }),
      query: (col, ...cons) => ({ col, cons }),
      serverTimestamp: () => SERVER_TIME,
      async getDocsFromServer(q) {
        if (device.offline) throw new Error('unavailable');
        return { docs: [...docs].filter(([p, d]) => matches(q, p, d)).sort((a, b) => a[1].updated_at.ms - b[1].updated_at.ms).map(([p, d]) => snapDoc(p, d)) };
      },
      writeBatch() {
        const ops = [];
        return {
          set: (ref, data) => ops.push({ ref, data }),
          commit() {
            // The writer's own listeners first see the write as pending (no server time yet)
            for (const l of listeners) if (l.device === device) {
              const changes = ops.filter(o => matches(l.q, o.ref.path, { updated_at: { ms: Infinity } })).map(o => ({ type: 'modified', doc: snapDoc(o.ref.path, { ...o.data, updated_at: null }, true) }));
              if (changes.length) l.next({ docChanges: () => changes });
            }
            if (device.offline) return new Promise(() => {}); // Firestore waits silently while offline
            for (const o of ops) {
              assert.strictEqual(o.data.updated_at, SERVER_TIME, 'writes use the server clock');
              assert.deepStrictEqual(Object.keys(o.data).sort(), ['deleted', 'json', 'kind', 'updated_at'], 'only the fields the rules allow');
              docs.set(o.ref.path, { ...o.data, updated_at: new Timestamp(clock += 7) });
            }
            for (const l of listeners) {
              const changes = ops.filter(o => matches(l.q, o.ref.path, docs.get(o.ref.path))).map(o => ({ type: 'modified', doc: snapDoc(o.ref.path, docs.get(o.ref.path)) }));
              if (changes.length) setImmediate(() => l.next({ docChanges: () => changes }));
            }
            return Promise.resolve();
          },
        };
      },
      onSnapshot(q, next) {
        const l = { q, next, device };
        listeners.add(l);
        setImmediate(() => next({ docChanges: () => [] })); // initial snapshot
        return () => listeners.delete(l);
      },
    };
  }
  return { docs, sdk };
}

function createDevice(server, uid, records = {}) {
  const device = { offline: false, recs: new Map(Object.entries(records).map(([id, data]) => [id, { kind: id.split(':')[0], data }])) };
  let meta = null;
  const app = {
    records: () => new Map([...device.recs].map(([k, v]) => [k, { kind: v.kind, data: JSON.parse(JSON.stringify(v.data)) }])),
    apply(rows) { for (const r of rows) { if (r.deleted) device.recs.delete(r.id); else device.recs.set(r.id, { kind: r.kind, data: r.data }); } },
    replaceAll(rows) { device.recs.clear(); app.apply(rows); },
    isPristine: () => false,
    chooseFirstSync: async () => 'merge',
  };
  const statuses = [];
  device.statuses = statuses;
  device.engine = createEngine({
    backend: firestoreBackend(server.sdk(device), {}, uid, { timeoutMs: 50 }),
    store: { load: () => meta, save: m => { meta = JSON.parse(JSON.stringify(m)); }, clear: () => { meta = null; } },
    app,
    onStatus: s => statuses.push(s),
    retryMs: 3600e3,
  });
  device.set = (id, data) => { device.recs.set(id, { kind: id.split(':')[0], data }); device.engine.changed(); };
  device.del = id => { device.recs.delete(id); device.engine.changed(); };
  device.get = id => device.recs.get(id) && device.recs.get(id).data;
  return device;
}
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const settle = async (...devices) => { for (let i = 0; i < 3; i++) { await tick(); for (const d of devices) { await d.engine.syncNow(); await d.engine.flush(); } } };

(async () => {
  const server = createServer();
  const A = createDevice(server, 'me', { 'task:t1': { title: 'Buy milk', tags: [], nested: [[1, 2]], gone: undefined }, settings: { accent: '#7b68ee' } });
  const B = createDevice(server, 'me', {});
  const other = createDevice(server, 'someone-else', { 'task:x': { title: 'Theirs' } });

  await A.engine.start('me');
  await A.engine.flush();
  const stored = server.docs.get('users/me/records/task:t1');
  assert.ok(stored, 'stored under users/{uid}/records/{id}');
  assert.strictEqual(stored.kind, 'task');
  assert.strictEqual(stored.deleted, false);
  assert.deepStrictEqual(JSON.parse(stored.json), { title: 'Buy milk', tags: [], nested: [[1, 2]] }, 'any shape round-trips as JSON (nested arrays included)');

  await other.engine.start('someone-else');
  await B.engine.start('me');
  await settle(A, B, other);
  assert.strictEqual(B.get('task:t1').title, 'Buy milk', 'second device receives the data');
  assert.ok(!B.recs.has('task:x'), 'another user’s records are never read');
  assert.ok(!other.recs.has('task:t1'));

  // Live update: A edits, B hears it through the listener without a manual sync
  A.set('task:t1', { title: 'Buy oat milk', tags: ['shop'] });
  await tick(700); await A.engine.flush(); await tick(); await B.engine.flush();
  assert.strictEqual(B.get('task:t1').title, 'Buy oat milk', 'realtime change arrives');

  // Deletes travel as tombstones
  B.del('task:t1');
  await tick(700); await B.engine.flush(); await settle(A, B);
  assert.strictEqual(server.docs.get('users/me/records/task:t1').json, null);
  assert.strictEqual(server.docs.get('users/me/records/task:t1').deleted, true);
  assert.ok(!A.recs.has('task:t1'), 'delete reaches the other device');

  // Offline: the upload times out, sync reports it, and catches up once back online
  B.offline = true;
  B.set('task:t2', { title: 'Written offline' });
  await tick(700); await B.engine.flush();
  assert.ok(['error', 'offline'].includes(B.statuses[B.statuses.length - 1]), 'offline upload is reported, not stuck');
  B.offline = false;
  await settle(A, B);
  assert.strictEqual(A.get('task:t2').title, 'Written offline', 'offline edit arrives after reconnecting');

  for (const d of [A, B, other]) d.engine.stop();
  console.log('firestore backend tests passed');
})().catch(e => { console.error(e); process.exit(1); });
