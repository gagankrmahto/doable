// Issue tracker logic: node test/issues.test.js
const assert = require('assert');
require('../web/issues.js');
const I = globalThis.Issues;

const bug = I.from({ id: 'i1', projectId: 'p1', type: 'bug', title: '  Contact form 500s on empty phone ', severity: 'critical', reporter: 'Dr Verma', createdAt: 1000 });
assert.strictEqual(bug.title, 'Contact form 500s on empty phone');
assert.strictEqual(bug.status, 'open');
assert.strictEqual(bug.severity, 'critical');
assert.strictEqual(bug.priority, undefined, 'bugs carry severity, not priority');
const rfe = I.from({ id: 'i2', projectId: 'p1', type: 'feature', title: 'Export to PDF', priority: 'high', createdAt: 2000 });
assert.strictEqual(rfe.severity, undefined);
assert.strictEqual(rfe.priority, 'high');
assert.strictEqual(I.from({ id: 'x', projectId: 'p1', type: 'nonsense', status: 'weird' }).type, 'bug');
assert.strictEqual(I.from({ id: 'x', projectId: 'p1', status: 'weird' }).status, 'open');
assert.strictEqual(I.from({ title: 'no ids' }), null);

const fixed = I.change(bug, { status: 'fixed', fixVersion: 'v1.2.0', note: 'validated phone field' });
assert.strictEqual(fixed.status, 'fixed');
assert.strictEqual(fixed.fixVersion, 'v1.2.0');
assert.ok(fixed.closedAt > 0 && fixed.updatedAt >= fixed.closedAt - 5);
assert.deepStrictEqual(fixed.history.map(h => [h.from, h.to, h.note]), [['open', 'fixed', 'validated phone field']]);
assert.ok(!('note' in fixed));
const reopened = I.change(fixed, { status: 'open' });
assert.strictEqual(reopened.closedAt, undefined, 'reopening clears closedAt');
assert.strictEqual(reopened.history.length, 2);
const retitled = I.change(bug, { title: 'New title' });
assert.strictEqual(retitled.history.length, 0, 'non-status edits add no history');

const minor = I.from({ id: 'i3', projectId: 'p1', type: 'bug', severity: 'minor', title: 'Typo', createdAt: 3000, updatedAt: 9000 });
const chore = I.from({ id: 'i4', projectId: 'p1', type: 'task', title: 'Upgrade deps', createdAt: 4000 });
const sorted = I.sort([chore, minor, rfe, fixed, bug]);
assert.deepStrictEqual(sorted.map(i => i.id), ['i1', 'i3', 'i2', 'i4', 'i1'], 'open first: critical bug, minor bug, high feature, chore; closed last');
assert.strictEqual(sorted[4].id, 'i1');
assert.strictEqual(sorted[4].status, 'fixed');

assert.deepStrictEqual(I.summary([bug, rfe, minor, chore, fixed]), { total: 5, open: 4, openBugs: 2, openFeatures: 1, critical: 1, fixed: 1, closed: 0 });
assert.strictEqual(I.health([]), null);
assert.strictEqual(I.health([bug, rfe]), 0);
assert.strictEqual(I.health([fixed, rfe]), 75, 'critical bug weighs 3, feature 1');
console.log('issues tests passed');
