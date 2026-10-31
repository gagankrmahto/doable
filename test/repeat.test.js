// Repeat rules: quick-add phrases and next-due stepping: node test/repeat.test.js
const assert = require('assert');
globalThis.window = globalThis;
require('../web/nlp.js');
const { parse } = globalThis.QuickParse;
const src = require('fs').readFileSync(require('path').join(__dirname, '../web/app.js'), 'utf8');

// Quick-add phrases
const rep = text => parse(text, { lists: [] }).repeat;
assert.deepStrictEqual(rep('File GST return quarterly'), { freq: 'monthly', interval: 3 });
assert.deepStrictEqual(rep('Advance tax every quarter'), { freq: 'monthly', interval: 3 });
assert.deepStrictEqual(rep('Backups every 3 months'), { freq: 'monthly', interval: 3 });
assert.deepStrictEqual(rep('Insurance premium half-yearly'), { freq: 'monthly', interval: 6 });
assert.deepStrictEqual(rep('AMC visit twice a year'), { freq: 'monthly', interval: 6 });
assert.deepStrictEqual(rep('Rotate passwords every six months'), { freq: 'monthly', interval: 6 });
assert.deepStrictEqual(rep('Pay rent every month'), { freq: 'monthly', interval: 1 }, 'existing phrases unchanged');
assert.deepStrictEqual(rep('Standup every weekday'), { freq: 'weekdays', interval: 1 });
assert.strictEqual(parse('File GST return quarterly', { lists: [] }).title, 'File GST return');

// Month stepping keeps the original day of month and clamps to month ends
const fn = src.match(/function addMonthsKeepEnd[\s\S]*?\n}\n/)[0];
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addMonthsKeepEnd = new Function('parseYmd', fn + '; return addMonthsKeepEnd;')(parseYmd);
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
assert.strictEqual(ymd(addMonthsKeepEnd(parseYmd('2026-03-31'), 3, '2026-03-31')), '2026-06-30', 'quarter end stays on month end');
assert.strictEqual(ymd(addMonthsKeepEnd(parseYmd('2026-06-30'), 3, '2026-03-31')), '2026-09-30');
assert.strictEqual(ymd(addMonthsKeepEnd(parseYmd('2026-09-30'), 3, '2026-03-31')), '2026-12-31', 'returns to the 31st when the month has one');
assert.strictEqual(ymd(addMonthsKeepEnd(parseYmd('2026-01-31'), 1, '2026-01-31')), '2026-02-28');
assert.strictEqual(ymd(addMonthsKeepEnd(parseYmd('2026-02-28'), 1, '2026-01-31')), '2026-03-31');
assert.strictEqual(ymd(addMonthsKeepEnd(parseYmd('2026-11-15'), 6, '2026-11-15')), '2027-05-15');
assert.strictEqual(ymd(addMonthsKeepEnd(parseYmd('2026-11-15'), 12, '2026-11-15')), '2027-11-15', 'yearly uses the same stepping');
console.log('repeat tests passed');
