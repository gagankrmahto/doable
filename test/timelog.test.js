// Time tracking helpers: node test/timelog.test.js
const assert = require('assert');
require('../web/timelog.js');
const T = globalThis.TimeLog;
const H = 3600000, M = 60000;
const now = new Date(2026, 10, 2, 15, 0).getTime(); // Mon 2 Nov 2026, 15:00 local

let t = { id: 'a', title: 'Build pages' };
t = T.start(t, now - 2 * H);
assert.ok(T.running(t) && T.running(t).s === now - 2 * H);
assert.strictEqual(T.start(t, now).logs.length, 1, 'starting twice does nothing');
assert.strictEqual(T.fmt(T.ms(t.logs, now)), '2h', 'running time counts up to now');
t = T.stop(t, now, 'header + footer');
assert.strictEqual(T.running(t), null);
assert.deepStrictEqual(t.logs, [{ s: now - 2 * H, e: now, n: 'header + footer' }]);
assert.strictEqual(T.hours(t.logs), 2);

const mistap = T.stop(T.start({ id: 'b' }, now), now + 5000);
assert.deepStrictEqual(mistap.logs, [], 'a 5-second timer is discarded');

t = T.add(t, 45, { end: now - 3 * 24 * H, note: 'forgot to time' });
assert.strictEqual(t.logs.length, 2);
assert.strictEqual(T.fmt(T.ms(t.logs, now)), '2h 45m');
assert.strictEqual(T.add(t, 0).logs.length, 2);
assert.strictEqual(T.remove(t, 1).logs.length, 1);

// Totals: today = 2h (the earlier log was 3 days ago, i.e. Friday 30 Oct, last week)
const u = T.start({ id: 'c', logs: [{ s: now - 26 * H, e: now - 25 * H }] }, now - 10 * M); // 1h yesterday + 10m running
const tot = T.totals([t, u], { now, weekStartsOn: 1 });
assert.strictEqual(T.fmt(tot.today), '2h 10m');
assert.strictEqual(T.fmt(tot.week), '2h 10m', 'yesterday (Sunday) is last week when weeks start Monday');
assert.strictEqual(T.fmt(T.totals([t, u], { now, weekStartsOn: 0 }).week), '3h 10m', 'with Sunday weeks, yesterday counts');
assert.strictEqual(T.fmt(tot.ms), '3h 55m');
assert.strictEqual(tot.running.id, 'c');
assert.strictEqual(T.clock(3725000), '01:02:05');
assert.strictEqual(T.fmt(20000), '0m');
console.log('timelog tests passed');
