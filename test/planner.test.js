// Course planner tests with the real panchang and festival data: node test/planner.test.js
process.env.TZ = 'Asia/Kolkata';
const assert = require('assert');
globalThis.window = globalThis;
require('../web/panchang.js');
require('../web/data/festivals.js');
require('../web/planner.js');
const { suggest, scoreStart, PRESETS } = window.CoursePlanner;
const P = window.Panchang;
P.setLocation({ lat: 12.83, lon: 77.51 });

const fest = d => window.DOABLE_FESTIVALS.filter(f => f.d === d).map(f => ({ set: 'festivals', t: f.t, k: f.k }));
const aol = { '2026-07-29': [{ set: 'aol', t: 'Guru Purnima' }], '2026-06-21': [{ set: 'aol', t: 'International Yoga Day' }] };
const busy = {
  '2026-11-20': [{ t: 'Board meeting', start: Date.parse('2026-11-20T18:30:00+05:30'), end: Date.parse('2026-11-20T19:30:00+05:30') }],
  '2026-12-05': [{ t: 'Wedding', allDay: true }],
};
const ctx = {
  tithi: d => P.dayInfo(d).tithi,
  rahu: d => P.dayInfo(d).rahu.map(x => x.getTime()),
  events: d => [...fest(d), ...(aol[d] || [])],
  busy: d => busy[d] || [],
  clock: ms => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
};
const hp = PRESETS.find(p => p.id === 'happiness');
const base = { days: hp.days, time: hp.time, minutes: hp.minutes, startDays: hp.startDays, today: '2026-10-20', prefs: {} };

// 1. Happiness Program, Friday starts, Nov–Dec 2026
const { options, considered } = suggest({ ...base, from: '2026-10-30', to: '2026-12-31' }, ctx);
assert.ok(considered >= 8, 'considered every Friday');
assert.ok(options.length === 5, 'five options');
assert.ok(options.every(o => new Date(o.start + 'T00:00').getDay() === 5), 'all start on Friday');
for (let i = 1; i < options.length; i++) assert.ok(options[i - 1].score >= options[i].score, 'sorted by score');
for (const a of options) for (const b of options) if (a !== b) assert.ok(a.end < b.start || a.start > b.end, 'options do not overlap');

// Diwali weekend (Fri 6 – Sun 8 Nov) is penalised and is not the top pick
const diwali = scoreStart('2026-11-06', { ...base }, ctx);
assert.ok(diwali.reasons.some(r => /Diwali/.test(r.text) && r.pts < 0), 'Diwali penalty');
assert.notStrictEqual(options[0].start, '2026-11-06');

// Clashes with your own calendar
const clash = scoreStart('2026-11-20', { ...base }, ctx);
assert.ok(clash.reasons.some(r => /Board meeting/.test(r.text) && r.pts < 0), 'meeting clash');
const wedding = scoreStart('2026-12-04', { ...base }, ctx);
assert.ok(wedding.reasons.some(r => /Wedding/.test(r.text)), 'all-day clash');
assert.ok(!scoreStart('2026-11-20', { ...base, prefs: { busy: false } }, ctx).reasons.some(r => /Board/.test(r.text)), 'busy pref off');

// 2. Moon: an Amavasya start is discouraged, a waxing start is preferred
let amavasya = null;
for (let d = '2026-11-01'; !amavasya; d = new Date(Date.parse(d + 'T12:00:00+05:30') + 864e5).toISOString().slice(0, 10)) if (P.dayInfo(d).tithi.n === 30) amavasya = d;
const am = scoreStart(amavasya, { ...base, startDays: [] }, ctx);
assert.ok(am.reasons.some(r => /Amavasya/.test(r.text) && r.pts < 0), `Amavasya start ${amavasya}`);

// 3. Short notice
const soon = scoreStart('2026-10-23', { ...base }, ctx);
assert.ok(soon.reasons.some(r => /Only 3 days/.test(r.text)), 'short-notice penalty');

// 4. Daytime sessions on working days hurt attendance; early-morning yoga doesn't
const kidsWeekday = scoreStart('2026-11-30', { ...base, days: 2, time: '10:00', minutes: 180 }, ctx); // Mon–Tue, no holidays
assert.ok(kidsWeekday.reasons.some(r => /2 working days with a daytime session/.test(r.text)), 'weekday daytime penalty');
const yoga = scoreStart('2026-11-26', { ...base, days: 4, time: '06:30', minutes: 120 }, ctx); // Thu–Sun
assert.ok(!yoga.reasons.some(r => /daytime/.test(r.text)), 'early yoga is fine');
assert.ok(yoga.reasons.some(r => /Includes the weekend/.test(r.text)), 'weekend bonus');

// 5. Yoga Day helps; Guru Purnima celebrations make teachers busy
const yd = scoreStart('2026-06-19', { ...base, startDays: [] }, ctx); // Fri 19 – Sun 21 Jun
assert.ok(yd.reasons.some(r => /Yoga Day/.test(r.text) && r.pts > 0), 'Yoga Day bonus');
const gp = scoreStart('2026-07-28', { ...base, startDays: [] }, ctx);
assert.ok(gp.reasons.some(r => /Guru Purnima/.test(r.text) && r.pts < 0), 'Guru Purnima busy');

console.log('planner tests passed');
options.forEach(o => console.log(`  ${o.start}…${o.end}  ${o.score.toFixed(1).padStart(5)}  ${o.rating.padEnd(9)}  ${o.reasons.map(r => (r.pts > 0 ? '+' : r.pts < 0 ? '−' : '·') + ' ' + r.text).join(' | ')}`));
