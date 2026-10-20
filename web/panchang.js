/* Doable — panchang for any location.
 * - New/full moon instants: Meeus, "Astronomical Algorithms", ch. 49 (≈1 min).
 * - Moon longitude: Meeus ch. 47, main periodic terms (≈0.003°); Sun: ch. 25 (≈0.01°).
 *   Tithi = elongation (Moon − Sun) / 12°, so tithi boundaries are good to about a minute.
 * - Sunrise/sunset: NOAA approximation (≈1 min) for the chosen latitude/longitude.
 * Days follow the usual Smarta panchang rules: a tithi belongs to the day whose sunrise it covers
 * (Pradosh: Trayodashi at sunset; Masik Shivaratri: Krishna Chaturdashi at midnight).
 * Dates are calendar dates in the device's time zone. Local panchangs can still differ by a day
 * when a tithi changes within minutes of sunrise. */
(function (global) {
  'use strict';

  const D2R = Math.PI / 180;
  const sin = d => Math.sin(d * D2R);
  const cos = d => Math.cos(d * D2R);
  const norm = d => ((d % 360) + 360) % 360;
  const pad = n => String(n).padStart(2, '0');
  const DELTA_T_DAYS = 69.5 / 86400; // TT − UT, mid-2020s
  const ymdLocal = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const parseYmd = s => s.split('-').map(Number);

  let loc = { lat: 12.83, lon: 77.51 }; // Art of Living International Center, Bengaluru (default)
  const caches = new Map();
  const cache = name => { const key = `${name}|${loc.lat.toFixed(3)},${loc.lon.toFixed(3)}`; if (!caches.has(key)) caches.set(key, new Map()); return caches.get(key); };

  /* ---------- Sun & Moon positions ---------- */
  const centuries = ms => ((ms / 86400000 + 2440587.5 + DELTA_T_DAYS) - 2451545) / 36525;

  function sunLongitude(T) {
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
    return norm(L0 + C - 0.00569); // with aberration; nutation cancels in the Moon−Sun difference
  }

  // [D, M, M', F, coefficient in 1e-6 degrees] — Meeus table 47.A (longitude), main terms
  const MOON_TERMS = [
    [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618],
    [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332], [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066],
    [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
    [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528], [0, 0, 1, -2, 10980],
    [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034], [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888],
    [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
    [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665], [0, 1, -2, 0, -2689],
    [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390], [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236],
    [0, 1, 2, 0, -2120], [0, 2, 0, 0, -2069], [2, -2, -1, 0, 2048], [2, 0, 1, -2, -1773],
    [2, 0, 0, 2, -1595], [4, -1, -1, 0, 1215], [0, 0, 2, 2, -1110], [3, 0, -1, 0, -892],
    [2, 1, 1, 0, -810], [4, -1, -2, 0, 759], [0, 2, -1, 0, -713], [2, 2, -1, 0, -700],
    [2, 1, -2, 0, 691], [2, -1, 0, -2, 596], [4, 0, 1, 0, 549], [0, 0, 4, 0, 537],
    [4, -1, 0, 0, 520], [1, 0, -2, 0, -487], [2, 1, 0, -2, -399], [0, 0, 2, -2, -381],
    [1, 1, 1, 0, 351], [3, 0, -2, 0, -340], [4, 0, -3, 0, 330], [2, -1, 2, 0, 327],
    [0, 2, 1, 0, -323], [1, 1, -1, 0, 299], [2, 0, 3, 0, 294],
  ];
  function moonLongitude(T) {
    const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
    const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
    const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
    const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
    const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;
    const E = 1 - 0.002516 * T - 0.0000074 * T2;
    let sum = 0;
    for (const [d, m, mp, f, c] of MOON_TERMS) {
      const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
      sum += c * e * sin(d * D + m * M + mp * Mp + f * F);
    }
    const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.29 * T;
    sum += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
    return norm(Lp + sum / 1e6);
  }

  const elongation = ms => { const T = centuries(ms); return norm(moonLongitude(T) - sunLongitude(T)); };

  const TITHI_NAMES = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi'];
  // Tithi 1–30 at an instant, with the moment it ends
  function tithiAt(ms) {
    const e = elongation(ms);
    const n = Math.floor(e / 12) + 1;
    let t = ms + ((n * 12 - e) / 12.19) * 86400000; // ~12.19°/day; refine
    for (let i = 0; i < 3; i++) {
      let diff = n * 12 - elongation(t);
      if (diff > 180) diff -= 360; else if (diff < -180) diff += 360;
      t += (diff / 12.19) * 86400000;
    }
    const paksha = n <= 15 ? 'Shukla' : 'Krishna';
    const name = n === 15 ? 'Purnima' : n === 30 ? 'Amavasya' : TITHI_NAMES[(n - 1) % 15];
    return { n, name, paksha, label: n === 15 || n === 30 ? name : `${paksha} ${name}`, endsAt: new Date(t) };
  }

  /* ---------- Sun times ---------- */
  // Sunrise/sunset (UTC ms) for a local calendar date at the current location. zenith 90.833° = standard.
  function sunTimes(y, m, d) {
    const N = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
    const g = (2 * Math.PI / 365) * (N - 1);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const lat = loc.lat * D2R;
    const x = cos(90.833) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
    const ha = Math.acos(Math.max(-1, Math.min(1, x))) / D2R; // clamp for polar day/night
    const base = Date.UTC(y, m - 1, d);
    return {
      sunrise: base + (720 - 4 * (loc.lon + ha) - eqt) * 60000,
      sunset: base + (720 - 4 * (loc.lon - ha) - eqt) * 60000,
      noon: base + (720 - 4 * loc.lon - eqt) * 60000,
    };
  }
  const sunTimesFor = ymd => { const [y, m, d] = parseYmd(ymd); return sunTimes(y, m, d); };
  const addDay = (ymd, n) => { const [y, m, d] = parseYmd(ymd); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };

  // Panchang day of an instant: the date of the last sunrise before it.
  function tithiDay(ms) {
    let d = ymdLocal(ms);
    if (ms < sunTimesFor(d).sunrise) d = addDay(d, -1);
    return d;
  }

  /* ---------- Moon phases ---------- */
  function phaseJDE(k) {
    const T = k / 1236.85;
    const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
    const E = 1 - 0.002516 * T - 0.0000074 * T2;
    const M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3;
    const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
    const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
    const Om = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
    const full = Math.abs(k % 1) > 0.25;
    const c = full
      ? [-0.40614, 0.17302, 0.01614, 0.01043, 0.00734, -0.00515, 0.00209]
      : [-0.4072, 0.17241, 0.01608, 0.01039, 0.00739, -0.00514, 0.00208];
    jde += c[0] * sin(Mp) + c[1] * E * sin(M) + c[2] * sin(2 * Mp) + c[3] * sin(2 * F)
      + c[4] * E * sin(Mp - M) + c[5] * E * sin(Mp + M) + c[6] * E * E * sin(2 * M)
      - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M)
      - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
      - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om) - 0.00007 * sin(Mp + 2 * M)
      + 0.00004 * sin(2 * Mp - 2 * F) + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F)
      + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F) + 0.00003 * sin(Mp - M + 2 * F)
      - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
    const A = [
      [299.77 + 0.107408 * k - 0.009173 * T2, 0.000325], [251.88 + 0.016321 * k, 0.000165],
      [251.83 + 26.651886 * k, 0.000164], [349.42 + 36.412478 * k, 0.000126], [84.66 + 18.206239 * k, 0.00011],
      [141.74 + 53.303771 * k, 0.000062], [207.14 + 2.453732 * k, 0.00006], [154.84 + 7.30686 * k, 0.000056],
      [34.52 + 27.261239 * k, 0.000047], [207.19 + 0.121824 * k, 0.000042], [291.34 + 1.844379 * k, 0.00004],
      [161.72 + 24.198154 * k, 0.000037], [239.56 + 25.513099 * k, 0.000035], [331.55 + 3.592518 * k, 0.000023],
    ];
    for (const [arg, amp] of A) jde += amp * sin(arg);
    return jde;
  }

  function phases(year) {
    const c = cache('phases');
    if (c.has(year)) return c.get(year);
    const out = [];
    const k0 = Math.floor((year - 2000) * 12.3685) - 2;
    for (let i = 0; i < 18; i++) {
      for (const half of [0, 0.5]) {
        const utcMs = (phaseJDE(k0 + i + half) - DELTA_T_DAYS - 2440587.5) * 86400000;
        const d = tithiDay(utcMs);
        if (+d.slice(0, 4) !== year) continue;
        const local = new Date(utcMs);
        out.push({ type: half ? 'full' : 'new', d, utc: local, localDate: ymdLocal(utcMs), localTime: `${pad(local.getHours())}:${pad(local.getMinutes())}` });
      }
    }
    out.sort((a, b) => a.utc - b.utc);
    c.set(year, out);
    return out;
  }

  /* ---------- Day details & special days ---------- */
  // Rahu Kaal: 1/8 of daylight; segment by weekday (Sun..Sat)
  const RAHU_SEGMENT = [8, 2, 7, 5, 6, 4, 3];
  function dayInfo(ymd) {
    const c = cache('day');
    if (c.has(ymd)) return c.get(ymd);
    const { sunrise, sunset } = sunTimesFor(ymd);
    const part = (sunset - sunrise) / 8;
    const [y, m, d] = parseYmd(ymd);
    const seg = RAHU_SEGMENT[new Date(y, m - 1, d).getDay()];
    const info = {
      sunrise: new Date(sunrise),
      sunset: new Date(sunset),
      tithi: tithiAt(sunrise + 60000),
      rahu: [new Date(sunrise + (seg - 1) * part), new Date(sunrise + seg * part)],
      brahma: [new Date(sunrise - 96 * 60000), new Date(sunrise - 48 * 60000)], // 2 muhurtas before sunrise
    };
    c.set(ymd, info);
    return info;
  }

  function specialDays(year) {
    const c = cache('special');
    if (c.has(year)) return c.get(year);
    const out = [];
    const start = `${year - 1}-12-30`;
    const days = [];
    for (let d = start; d <= `${year + 1}-01-02`; d = addDay(d, 1)) {
      const st = sunTimesFor(d);
      const nextRise = sunTimesFor(addDay(d, 1)).sunrise;
      const midnight = st.sunset + (nextRise - st.sunset) / 2; // Nishita ≈ middle of the night
      // Pradosh kaal ≈ the two hours after sunset: how much of it is Trayodashi?
      const evening = [0, 30, 60, 90, 120].map(min => tithiAt(st.sunset + min * 60000).n);
      const trayo = evening.filter(n => n === 13 || n === 28).length;
      days.push({ d, rise: tithiAt(st.sunrise + 60000).n, night: tithiAt(midnight).n, trayo, trayoPaksha: evening.includes(13) ? 'Shukla' : 'Krishna' });
    }
    for (let i = 1; i < days.length - 1; i++) {
      const prev = days[i - 1], cur = days[i], next = days[i + 1];
      if (!cur.d.startsWith(year + '-')) continue;
      // Ekadashi: at sunrise (first day if it spans two sunrises); if it never covers a sunrise, the day it begins
      const ek = n => n === 11 || n === 26;
      if (ek(cur.rise) && !ek(prev.rise)) out.push({ d: cur.d, kind: 'ekadashi', paksha: cur.rise === 11 ? 'Shukla' : 'Krishna' });
      else if ((cur.rise === 10 && next.rise === 12) || (cur.rise === 25 && next.rise === 27)) out.push({ d: cur.d, kind: 'ekadashi', paksha: cur.rise === 10 ? 'Shukla' : 'Krishna' });
      // Pradosh: the evening whose Pradosh kaal is most covered by Trayodashi (first day on a tie)
      if (cur.trayo > 0 && cur.trayo > prev.trayo && cur.trayo >= next.trayo) out.push({ d: cur.d, kind: 'pradosh', paksha: cur.trayoPaksha });
      // Masik Shivaratri: Krishna Chaturdashi at midnight
      if (cur.night === 29 && prev.night !== 29) out.push({ d: cur.d, kind: 'shivaratri', paksha: 'Krishna' });
    }
    c.set(year, out);
    return out;
  }

  function setLocation(l) {
    if (!l || !isFinite(l.lat) || !isFinite(l.lon)) return;
    loc = { lat: +l.lat, lon: +l.lon };
  }

  global.Panchang = { setLocation, getLocation: () => ({ ...loc }), phases, dayInfo, specialDays, tithiAt, sunTimes, elongation };
  global.MoonPhases = { phases }; // backwards-compatible name
})(typeof window !== 'undefined' ? window : globalThis);
