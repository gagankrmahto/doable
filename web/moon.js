/* Doable — moon phases (new and full moon instants).
 * Jean Meeus, "Astronomical Algorithms" (2nd ed.), chapter 49. Accurate to about a minute.
 * Purnima/Amavasya day follows the panchang convention: the tithi that is current at sunrise,
 * i.e. the date of the last sunrise (at Bengaluru) before the full/new moon instant.
 * Local panchangs can differ by a day when the moon phase falls right around sunrise. */
(function (global) {
  'use strict';

  const rad = d => (d * Math.PI) / 180;
  const sin = d => Math.sin(rad(d));

  // Julian Ephemeris Day of the true new (phase 0) or full (phase 0.5) moon for lunation k.
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
    // Planetary arguments
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

  const DELTA_T_DAYS = 69.5 / 86400; // TT − UT, ~69 s in the mid-2020s
  const IST_MS = 5.5 * 3600 * 1000;
  const pad = n => String(n).padStart(2, '0');

  // Sunrise (UTC ms) at the Art of Living International Center, Bengaluru — NOAA approximation, ±1 min.
  const LAT = 12.83, LON = 77.51;
  function sunriseUtc(y, m, d) {
    const N = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
    const g = (2 * Math.PI / 365) * (N - 1);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const lat = rad(LAT);
    const ha = Math.acos(Math.cos(rad(90.833)) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl)) * 180 / Math.PI;
    return Date.UTC(y, m - 1, d) + (720 - 4 * (LON + ha) - eqt) * 60000;
  }
  // Panchang day: the date whose sunrise is the last one before the instant.
  function tithiDay(utcMs) {
    const ist = new Date(utcMs + IST_MS);
    let y = ist.getUTCFullYear(), m = ist.getUTCMonth() + 1, d = ist.getUTCDate();
    if (utcMs < sunriseUtc(y, m, d)) {
      const prev = new Date(Date.UTC(y, m - 1, d) - 86400000);
      y = prev.getUTCFullYear(); m = prev.getUTCMonth() + 1; d = prev.getUTCDate();
    }
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  const cache = new Map();
  // All new and full moons whose panchang day falls in `year`.
  function phases(year) {
    if (cache.has(year)) return cache.get(year);
    const out = [];
    const k0 = Math.floor((year - 2000) * 12.3685) - 2;
    for (let i = 0; i < 18; i++) {
      for (const half of [0, 0.5]) {
        const k = k0 + i + half;
        const utcMs = (phaseJDE(k) - DELTA_T_DAYS - 2440587.5) * 86400000;
        const istMs = utcMs + IST_MS;
        const d = tithiDay(utcMs);
        if (+d.slice(0, 4) !== year) continue;
        const ist = new Date(istMs);
        out.push({ type: half ? 'full' : 'new', d, utc: new Date(utcMs), istDate: `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`, istTime: `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}` });
      }
    }
    out.sort((a, b) => a.utc - b.utc);
    cache.set(year, out);
    return out;
  }

  global.MoonPhases = { phases, sunriseUtc };
})(typeof window !== 'undefined' ? window : globalThis);
