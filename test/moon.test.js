// Panchang checks against published dates: node test/moon.test.js
// Runs in IST like an Indian device would.
process.env.TZ = 'Asia/Kolkata';
const assert = require('assert');
globalThis.window = globalThis;
require('../web/panchang.js');
require('../web/data/festivals.js');

const P = window.Panchang;
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

// 1. Moon phase instants (UTC): total lunar eclipse 2026-03-03 ~11:38, new moon 2026-11-09 ~07:02
const near = (iso, type, min) => P.phases(+iso.slice(0, 4)).some(p => p.type === type && Math.abs(p.utc - Date.parse(iso)) < min * 60000);
check(near('2026-03-03T11:38:00Z', 'full', 5), 'full moon 2026-03-03 11:38 UTC');
check(near('2026-11-09T07:02:00Z', 'new', 5), 'new moon 2026-11-09 07:02 UTC');

// 2. Moon/Sun model agrees with the phase algorithm: elongation is 180° at full moon, 0° at new moon
let maxErr = 0;
for (let y = 2025; y <= 2028; y++) for (const p of P.phases(y)) {
  const e = P.elongation(p.utc.getTime());
  const err = Math.abs(p.type === 'full' ? e - 180 : ((e + 180) % 360) - 180);
  maxErr = Math.max(maxErr, err);
}
check(maxErr < 0.05, `elongation at phases within 0.05° (max ${maxErr.toFixed(4)}°)`);

// 3. Bengaluru (default location) sunrise vs published tables: ~06:46 mid-Jan, 05:52 on Jun 1
const hhmm = ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
check(Math.abs(hhmm(P.sunTimes(2026, 1, 13).sunrise) - (6 * 60 + 46)) <= 3, 'Bengaluru sunrise Jan 13 ≈ 06:46');
check(Math.abs(hhmm(P.sunTimes(2026, 6, 1).sunrise) - (5 * 60 + 52)) <= 3, 'Bengaluru sunrise Jun 1 ≈ 05:52');

// 4. Purnima festivals land on computed full-moon days (Holika Dahan excluded: it follows the evening rule)
const fullDays = new Set();
for (let y = 2025; y <= 2028; y++) P.phases(y).filter(p => p.type === 'full').forEach(p => fullDays.add(p.d));
let purnimaChecked = 0;
for (const f of window.DOABLE_FESTIVALS) {
  if (!/^(Buddha Purnima|Raksha Bandhan|Guru Nanak Jayanti)$/.test(f.t) || +f.d.slice(0, 4) > 2028) continue;
  purnimaChecked++;
  check(fullDays.has(f.d), `Purnima festival ${f.d} ${f.t}`);
}
for (const d of ['2026-07-29', '2027-07-18']) { purnimaChecked++; check(fullDays.has(d), `Guru Purnima ${d}`); }

// 5. New Delhi Ekadashi & Pradosh 2026 (Drik Panchang / published Pradosh lists)
P.setLocation({ lat: 28.6139, lon: 77.209 });
const special = P.specialDays(2026);
const ek = new Set(special.filter(s => s.kind === 'ekadashi').map(s => s.d));
const pr = new Set(special.filter(s => s.kind === 'pradosh').map(s => s.d));
// Indira Ekadashi is Oct 6 (Drik: tithi 02:07 AM Oct 6 – 12:34 AM Oct 7); Oct 7 is the parana day.
const EKADASHI = ['2026-01-14', '2026-01-29', '2026-02-13', '2026-02-27', '2026-10-06', '2026-10-22', '2026-11-05', '2026-11-20', '2026-12-04', '2026-12-20'];
// Tithi timing check against Drik for that Ekadashi (New Delhi): starts 02:07, ends 00:34 next day
{
  P.setLocation({ lat: 28.6139, lon: 77.209 });
  const t = P.tithiAt(Date.parse('2026-10-06T06:00:00+05:30'));
  const end = new Date(t.endsAt);
  check(t.n === 26 && Math.abs(end - Date.parse('2026-10-07T00:34:00+05:30')) < 3 * 60000, `Indira Ekadashi ends 00:34 Oct 7 (got ${end.toISOString()})`);
}
const PRADOSH = ['2026-01-01', '2026-01-16', '2026-01-30', '2026-02-14', '2026-03-01', '2026-03-16', '2026-03-30', '2026-04-15', '2026-04-28', '2026-05-14', '2026-05-28', '2026-06-12', '2026-06-27', '2026-07-12', '2026-07-26', '2026-08-10', '2026-08-25', '2026-09-08', '2026-09-24', '2026-10-08', '2026-10-23', '2026-12-21'];
const ekHit = EKADASHI.filter(d => ek.has(d));
const prHit = PRADOSH.filter(d => pr.has(d));
console.log(`Ekadashi 2026 (Delhi): ${ekHit.length}/${EKADASHI.length} match; computed ${ek.size} in the year`);
console.log(`Pradosh 2026 (Delhi): ${prHit.length}/${PRADOSH.length} match; computed ${pr.size} in the year`);
EKADASHI.filter(d => !ek.has(d)).forEach(d => fails.push(`Ekadashi ${d} not found (nearby: ${[...ek].filter(x => Math.abs(Date.parse(x) - Date.parse(d)) < 3 * 864e5).join(', ') || 'none'})`));
PRADOSH.filter(d => !pr.has(d)).forEach(d => fails.push(`Pradosh ${d} not found (nearby: ${[...pr].filter(x => Math.abs(Date.parse(x) - Date.parse(d)) < 3 * 864e5).join(', ') || 'none'})`));
console.log(`Purnima festivals checked: ${purnimaChecked}; max elongation error at phases: ${maxErr.toFixed(4)}°`);

if (fails.length) { console.log('FAILURES:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('panchang tests passed');
