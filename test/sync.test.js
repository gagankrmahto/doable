// Multi-device sync tests against an in-memory fake server: node test/sync.test.js
const assert = require('assert');
require('../web/sync.js');
const { createEngine } = globalThis.DoableSyncEngine;

// --- Fake server: server clock, key reordering, realtime fan-out ---
function createServer() {
  const rows = new Map();
  const subs = new Set();
  let clock = Date.UTC(2026, 0, 1);
  const shuffle = v => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, shuffle(v[k])])) : v);
  return {
    rows,
    backendFor(device) {
      return {
        async fetchSince(since) {
          if (device.offline) throw new Error('offline');
          return [...rows.values()].filter(r => !since || r.updated_at >= since)
            .sort((a, b) => a.updated_at.localeCompare(b.updated_at)).map(r => JSON.parse(JSON.stringify(r)));
        },
        async upsert(list) {
          if (device.offline) throw new Error('offline');
          for (const r of list) {
            const row = { id: r.id, kind: r.kind, data: shuffle(JSON.parse(JSON.stringify(r.data))), deleted: r.deleted, updated_at: new Date(clock += 7).toISOString() };
            rows.set(r.id, row);
            for (const s of subs) setImmediate(() => s(JSON.parse(JSON.stringify(row))));
          }
        },
        subscribe(onRows, onState) {
          const fn = row => { if (!device.offline) onRows([row]); };
          subs.add(fn);
          setImmediate(() => onState('SUBSCRIBED'));
          return () => subs.delete(fn);
        },
      };
    },
  };
}

// --- Fake app: a plain record store standing in for Doable's state ---
function createDevice(server, name, { records = {}, pristine = false, choice = 'merge' } = {}) {
  const device = { name, offline: false, recs: new Map(Object.entries(records).map(([id, data]) => [id, { kind: id.split(':')[0], data }])) };
  let meta = null;
  const app = {
    records: () => new Map([...device.recs].map(([k, v]) => [k, { kind: v.kind, data: JSON.parse(JSON.stringify(v.data)) }])),
    apply(rows) {
      for (const r of rows) {
        if (r.kind === 'stats') {
          const cur = (device.recs.get(r.id) || { data: {} }).data;
          const merged = { ...cur };
          for (const [k, v] of Object.entries(r.data)) merged[k] = Math.max(merged[k] || 0, v);
          device.recs.set(r.id, { kind: 'stats', data: merged });
        } else if (r.deleted) device.recs.delete(r.id);
        else device.recs.set(r.id, { kind: r.kind, data: r.data });
      }
    },
    replaceAll(rows) { device.recs.clear(); app.apply(rows); },
    isPristine: () => pristine,
    chooseFirstSync: async () => choice,
  };
  device.engine = createEngine({
    backend: server.backendFor(device),
    store: { load: () => meta, save: m => { meta = JSON.parse(JSON.stringify(m)); }, clear: () => { meta = null; } },
    app,
    retryMs: 3600e3,
  });
  device.set = (id, data) => { device.recs.set(id, { kind: id.split(':')[0], data }); device.engine.changed(); };
  device.del = id => { device.recs.delete(id); device.engine.changed(); };
  device.get = id => device.recs.get(id) && device.recs.get(id).data;
  device.ids = () => [...device.recs.keys()].filter(k => k.startsWith('task:')).sort();
  return device;
}

const settle = async (...devices) => {
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setImmediate(r));
    for (const d of devices) { await d.engine.syncNow(); await d.engine.flush(); }
  }
};

(async () => {
  const server = createServer();
  let passed = 0;
  const test = async (name, fn) => { await fn(); passed++; console.log('  ✓', name); };

  const A = createDevice(server, 'A', { records: { 'task:t1': { title: 'Buy milk', due: null }, 'list:l1': { name: 'Inbox', pos: 0 }, settings: { accent: '#7b68ee' }, stats: { '2026-10-20': 3 } } });
  const B = createDevice(server, 'B', { records: { 'task:seed': { title: 'Welcome' }, settings: { accent: '#000000' }, stats: { '2026-10-20': 5, '2026-10-19': 1 } }, pristine: true });

  await test('first device uploads its data', async () => {
    await A.engine.start('u1'); await settle(A);
    assert.deepStrictEqual([...server.rows.keys()].sort(), ['list:l1', 'settings', 'stats', 'task:t1']);
  });

  await test('fresh (pristine) device adopts cloud data instead of duplicating starter tasks', async () => {
    await B.engine.start('u1'); await settle(A, B);
    assert.deepStrictEqual(B.ids(), ['task:t1']);
    assert.strictEqual(B.get('settings').accent, '#7b68ee');
  });

  await test('edit on A reaches B', async () => {
    A.set('task:t1', { title: 'Buy oat milk', due: '2026-10-21' }); await settle(A, B);
    assert.strictEqual(B.get('task:t1').title, 'Buy oat milk');
  });

  await test('new task on B reaches A', async () => {
    B.set('task:t2', { title: 'Call mom' }); await settle(A, B);
    assert.strictEqual(A.get('task:t2').title, 'Call mom');
  });

  await test('delete on B removes it on A', async () => {
    B.del('task:t1'); await settle(A, B);
    assert.strictEqual(A.get('task:t1'), undefined);
    assert.strictEqual(server.rows.get('task:t1').deleted, true);
  });

  await test('offline edits to different tasks merge', async () => {
    A.offline = true; B.offline = true;
    A.set('task:a-off', { title: 'Made offline on A' });
    B.set('task:b-off', { title: 'Made offline on B' });
    await settle(A, B);
    A.offline = false; B.offline = false;
    await settle(A, B);
    assert.deepStrictEqual(A.ids(), B.ids());
    assert.deepStrictEqual(A.ids(), ['task:a-off', 'task:b-off', 'task:t2']);
  });

  await test('same task edited on both: last to reach the server wins everywhere', async () => {
    A.offline = true; B.offline = true;
    A.set('task:t2', { title: 'A version' });
    B.set('task:t2', { title: 'B version' });
    A.offline = false; await settle(A);
    B.offline = false; await settle(B, A, B);
    assert.strictEqual(A.get('task:t2').title, 'B version');
    assert.strictEqual(B.get('task:t2').title, 'B version');
  });

  await test('device with its own data chooses "merge": keeps local tasks and gets cloud ones', async () => {
    const C = createDevice(server, 'C', { records: { 'task:c1': { title: 'From C' }, settings: { accent: '#ff0000' }, stats: { '2026-10-20': 9, '2026-10-18': 2 } }, choice: 'merge' });
    await C.engine.start('u1'); await settle(A, B, C);
    assert.deepStrictEqual(C.ids(), ['task:a-off', 'task:b-off', 'task:c1', 'task:t2']);
    assert.strictEqual(A.get('task:c1').title, 'From C');
    assert.strictEqual(C.get('settings').accent, '#7b68ee', 'cloud settings win on first contact');
    C.engine.stop();
  });

  await test('completion stats merge (max per day) instead of overwriting', async () => {
    await settle(A, B);
    assert.deepStrictEqual(A.get('stats'), { '2026-10-20': 9, '2026-10-18': 2 });
    assert.deepStrictEqual(B.get('stats'), { '2026-10-20': 9, '2026-10-18': 2 });
  });

  await test('device choosing "replace" drops its local tasks', async () => {
    const D = createDevice(server, 'D', { records: { 'task:d1': { title: 'Local only' } }, choice: 'replace' });
    await D.engine.start('u1'); await settle(D);
    assert.ok(!D.ids().includes('task:d1'));
    assert.ok(!server.rows.has('task:d1'));
    D.engine.stop();
  });

  await test('restart resumes from cursor without re-downloading or re-uploading', async () => {
    A.engine.stop();
    const before = server.rows.get('task:t2').updated_at;
    await A.engine.start('u1'); await settle(A);
    assert.strictEqual(server.rows.get('task:t2').updated_at, before, 'no redundant upload');
  });

  A.engine.stop(); B.engine.stop();
  console.log(`\n${passed} sync tests passed`);
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
