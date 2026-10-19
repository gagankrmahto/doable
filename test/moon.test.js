// Checks computed Purnima dates against festivals that always fall on Purnima: node test/moon.test.js
const assert = require('assert');
globalThis.window = globalThis;
require('../web/moon.js');
require('../web/data/festivals.js');

const fullMoonDays = new Set();
for (let y = 2025; y <= 2028; y++) MoonPhases.phases(y).filter(p => p.type === 'full').forEach(p => fullMoonDays.add(p.d));

// Holika Dahan is excluded on purpose: it's lit on the evening Purnima prevails, not by the sunrise rule.
const PURNIMA_FESTIVALS = /^(Buddha Purnima|Raksha Bandhan|Guru Nanak Jayanti)$/;
let checked = 0;
const misses = [];
for (const f of window.DOABLE_FESTIVALS) {
  if (!PURNIMA_FESTIVALS.test(f.t) || +f.d.slice(0, 4) > 2028) continue;
  checked++;
  if (!fullMoonDays.has(f.d)) misses.push(`${f.d} ${f.t}`);
}
// Guru Purnima (panchang sources): 2026-07-29, 2027-07-18
for (const d of ['2026-07-29', '2027-07-18']) { checked++; if (!fullMoonDays.has(d)) misses.push(`${d} Guru Purnima`); }

// Known astronomical instants (UTC): total lunar eclipse full moon 2026-03-03 ~11:38, new moon 2026-11-09 ~07:02
const near = (iso, type, minutes) => {
  const t = Date.parse(iso);
  return MoonPhases.phases(+iso.slice(0, 4)).some(p => p.type === type && Math.abs(p.utc - t) < minutes * 60000);
};
assert.ok(near('2026-03-03T11:38:00Z', 'full', 5), 'full moon 2026-03-03 11:38 UTC within 5 min');
assert.ok(near('2026-11-09T07:02:00Z', 'new', 5), 'new moon 2026-11-09 07:02 UTC within 5 min');

// Bengaluru sunrise sanity check (published tables: ~06:46 IST mid-January, 05:52–05:53 IST on Jun 1, 2026)
const istMin = ms => { const d = new Date(ms + 5.5 * 3600000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
assert.ok(Math.abs(istMin(MoonPhases.sunriseUtc(2026, 1, 13)) - (6 * 60 + 46)) <= 3, 'Bengaluru sunrise Jan 13 ≈ 06:46 IST');
assert.ok(Math.abs(istMin(MoonPhases.sunriseUtc(2026, 6, 1)) - (5 * 60 + 52)) <= 3, 'Bengaluru sunrise Jun 1 ≈ 05:52 IST');

const counts = MoonPhases.phases(2026).reduce((a, p) => ((a[p.type] = (a[p.type] || 0) + 1), a), {});
console.log(`2026: ${counts.full} full moons, ${counts.new} new moons`);
console.log(`Purnima festivals matched: ${checked - misses.length}/${checked}`);
if (misses.length) { console.log('Mismatches:\n  ' + misses.join('\n  ')); process.exit(1); }
console.log('moon tests passed');
