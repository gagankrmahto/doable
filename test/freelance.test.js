// Freelance project logic: node test/freelance.test.js
const assert = require('assert');
require('../web/freelance.js');
const F = globalThis.Freelance;
const DAY = 86400000;
const now = Date.parse('2026-11-01T10:00:00+05:30');
const today = '2026-11-01';

const tasks = [
  { id: 'm1', done: true, doneAt: now - 10 * DAY, createdAt: now - 20 * DAY },
  { id: 'm2', done: false, createdAt: now - 20 * DAY, updatedAt: now - 9 * DAY },
  { id: 's1', parentId: 'm2', done: true, doneAt: now - 9 * DAY, createdAt: now - 20 * DAY },
  { id: 's2', parentId: 'm2', done: false, createdAt: now - 20 * DAY },
];
assert.deepStrictEqual(F.progress(tasks), { milestones: 2, done: 1, pct: 50 });
assert.deepStrictEqual(F.progress([]), { milestones: 0, done: 0, pct: 0 });

const site = { id: 'p1', name: 'Clinic website', status: 'active', createdAt: now - 30 * DAY, due: '2026-11-20', price: 40000, paid: 10000 };
assert.strictEqual(F.lastActivity(site, tasks), now - 9 * DAY);
assert.strictEqual(F.isStale(site, tasks, now), true, 'nine quiet days is stale');
assert.strictEqual(F.isStale(site, [...tasks, { id: 'n', createdAt: now - DAY }], now), false);
assert.strictEqual(F.isStale({ ...site, status: 'lead' }, tasks, now), false, 'only active work goes stale');

const app = { id: 'p2', name: 'Inventory app', status: 'delivered', price: 90000, paid: 50000, due: '2026-10-25', createdAt: now };
const lead = { id: 'p3', name: 'Logo', status: 'lead', price: 5000, due: '2026-11-03', createdAt: now };
const paid = { id: 'p4', name: 'Old job', status: 'paid', price: 20000, paid: 20000, createdAt: now };
const a = F.alerts([site, app, lead, paid], id => (id === 'p1' ? tasks : []), today, now);
assert.deepStrictEqual(a.map(x => x.project.id + ':' + x.text), ['p1:No activity for 9 days', 'p3:Due 2026-11-03', 'p2:₹40,000 unpaid'], 'ordered by urgency; delivered work is not "overdue"');

assert.deepStrictEqual(F.totals([site, app, lead, paid]), { open: 3, quoted: 5000, billed: 150000, paid: 80000, due: 70000 });
assert.strictEqual(F.money(150000), '₹1.5 L');
assert.strictEqual(F.money(40000), '₹40,000');
assert.strictEqual(F.hours([{ start: now - 2 * 3600000, end: now - 3600000 }, { start: now - 1800000 }], now), 1.5);

console.log('freelance tests passed');
