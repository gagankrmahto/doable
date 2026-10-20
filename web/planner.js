/* Doable — course planner: scores every possible start date in a window and suggests the best few.
 * Looks at the moon (waxing start, Purnima/Ekadashi during the course, Amavasya/Rikta tithis avoided),
 * festivals (family festivals avoided, other holidays welcome), Art of Living celebrations, whether
 * working people can attend, Rahu Kaal at the start, promotion lead time and clashes with your own
 * tasks, meetings and Google events. Pure logic: the app passes the calendar data in via `ctx`. */
(function (global) {
  'use strict';

  const PRESETS = [
    { id: 'happiness', name: 'Happiness Program', emoji: '🌬️', days: 3, time: '18:00', minutes: 180, startDays: [5], note: 'Sudarshan Kriya™ · typically 3 days' },
    { id: 'sahaj', name: 'Sahaj Samadhi Meditation', emoji: '🧘', days: 3, time: '18:30', minutes: 120, startDays: [5], note: 'Typically 3 days, about 2 hours each' },
    { id: 'yoga', name: 'Sri Sri Yoga', emoji: '🤸', days: 4, time: '06:30', minutes: 120, startDays: [4], note: 'Typically 4 mornings' },
    { id: 'silence', name: 'Art of Silence', emoji: '🤫', days: 4, time: '06:00', minutes: 840, startDays: [4], note: 'Residential retreat · full days' },
    { id: 'kids', name: 'Kids & teens program', emoji: '🌱', days: 2, time: '10:00', minutes: 180, startDays: [6], note: 'Utkarsha / Medha Yoga · weekend mornings' },
    { id: 'intro', name: 'Intro talk / satsang', emoji: '🎶', days: 1, time: '18:30', minutes: 90, startDays: [], note: 'One evening' },
    { id: 'custom', name: 'Custom', emoji: '✨', days: 3, time: '18:00', minutes: 120, startDays: [], note: 'Set your own length and time' },
  ];

  // Festivals when most people are with family or travelling
  const FAMILY_FESTIVAL = /Diwali|Deepavali|Holi\b|Holika|Dussehra|Vijaya ?dashami|Durga Puja|Maha (Saptami|Ashtami|Navami)|Eid|Id-ul|Bakrid|Christmas|Ganesh|Pongal|Onam|Raksha|Janmashtami|Chhath|Bhai Dooj|Govardhan|Lohri|Bihu|Ugadi|Gudi Padwa|Makar Sankranti|Karva Chauth/i;
  const PROMO_EVENT = /Yoga Day|Meditation Day/i; // easy to promote around
  const RIKTA = new Set([4, 9, 14, 19, 24, 29]); // Chaturthi, Navami, Chaturdashi
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const pad = n => String(n).padStart(2, '0');
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const weekday = s => parse(s).getDay();
  const at = (day, hhmm) => { const d = parse(day); const [h, m] = hhmm.split(':').map(Number); d.setHours(h, m, 0, 0); return d.getTime(); };
  const dayName = (s, i) => `day ${i + 1} (${WD[weekday(s)]})`;

  function scoreStart(start, o, ctx) {
    const days = Array.from({ length: o.days }, (_, i) => addDays(start, i));
    const reasons = [];
    const add = (pts, text, kind) => reasons.push({ pts, text, kind: kind || (pts > 0 ? 'good' : pts < 0 ? 'bad' : 'info') });
    const p = o.prefs || {};
    const endMin = o.minutes;

    // Moon at sunrise on the first day
    if (p.moon !== false) {
      const t = ctx.tithi(start);
      if (t.n === 15) add(2, 'Starts on Purnima, the full moon');
      else if (t.n === 30) add(-3, 'Starts on Amavasya, usually avoided for beginnings');
      else if (t.n < 15) add(RIKTA.has(t.n) ? 1 : 2, `Waxing moon start (${t.label})${RIKTA.has(t.n) ? ', though a Rikta tithi' : ''}`);
      else if (RIKTA.has(t.n)) add(-1, `${t.label} is a Rikta tithi, traditionally avoided for starting`);
      else add(0, `Waning moon start (${t.label})`, 'info');
      if (weekday(start) === 4 && o.days > 1) add(0.5, 'Starts on Thursday (Guruvar)');
      days.forEach((d, i) => {
        if (i === 0) return;
        const n = ctx.tithi(d).n;
        if (n === 15) add(1.5, `Purnima on ${dayName(d, i)}: a beautiful time to meditate`);
        else if (n === 11 || n === 26) add(0.5, `Ekadashi on ${dayName(d, i)}`);
      });
    }

    // Festivals, holidays and Art of Living celebrations
    if (p.festivals !== false) {
      const seen = new Set();
      const aolBusy = [];
      days.forEach((d, i) => {
        for (const e of ctx.events(d)) {
          if (seen.has(e.t)) continue;
          if (e.set === 'festivals' && FAMILY_FESTIVAL.test(e.t)) { seen.add(e.t); add(-4, `${e.t} on ${dayName(d, i)}, when people are with family`); }
          else if (e.set === 'festivals' && e.k === 'holiday') { seen.add(e.t); if (!reasons.some(r => r.holiday)) reasons.push({ pts: 1, text: `${e.t} on ${dayName(d, i)} is a day off, so more people are free`, kind: 'good', holiday: true }); }
          else if (e.set === 'aol' && PROMO_EVENT.test(e.t)) { seen.add(e.t); add(1, `${e.t} during the course, easy to promote`); }
          else if (e.set === 'aol' && !e.hidden) { seen.add(e.t); aolBusy.push(`${e.t} on ${dayName(d, i)}`); }
        }
      });
      // Celebrations like Navratri span many named days: one capped reason
      if (aolBusy.length) add(Math.max(-1.5 * aolBusy.length, -3), `${aolBusy[0]}${aolBusy.length > 1 ? ` and ${aolBusy.length - 1} more celebration${aolBusy.length > 2 ? 's' : ''}` : ''}; teachers and volunteers may be busy`);
    }

    // Can working people come?
    const off = d => weekday(d) === 0 || weekday(d) === 6 || ctx.events(d).some(e => e.set === 'festivals' && e.k === 'holiday');
    const daytime = (() => { const [h, m] = o.time.split(':').map(Number); const s = h * 60 + m; return s < 17 * 60 && s + endMin > 9 * 60 + 30 && s >= 8 * 60; })();
    const workDaytime = days.filter(d => !off(d) && daytime);
    if (days.some(off) && o.days > 1) add(1, 'Includes the weekend');
    else if (o.days === 1 && off(start)) add(1, 'On a weekend or holiday');
    if (workDaytime.length) add(-1.5 * workDaytime.length, `${workDaytime.length === 1 ? 'One working day' : `${workDaytime.length} working days`} with a daytime session`);

    // Rahu Kaal at the start
    if (p.rahu !== false && ctx.rahu) {
      const [rs, re] = ctx.rahu(start);
      const s = at(start, o.time);
      if (s >= rs && s < re) add(-1, `Starts during Rahu Kaal (${ctx.clock(rs)}–${ctx.clock(re)})`);
    }

    // Time to promote
    const lead = diffDays(o.today, start);
    if (lead < 14) add(-2, `Only ${lead} days to spread the word (3+ weeks is ideal)`);
    else if (lead < 21) add(-0.5, `${lead} days to promote; 3 weeks is ideal`);

    // Your own calendar
    if (p.busy !== false && ctx.busy) {
      let pen = 0;
      const clashes = [];
      days.forEach(d => {
        const s = at(d, o.time), e = s + endMin * 60000;
        for (const b of ctx.busy(d)) {
          if (b.allDay || (b.start < e && b.end > s)) { clashes.push({ d, b }); pen -= 2; }
        }
      });
      if (clashes.length) {
        const shown = clashes.slice(0, 2).map(({ d, b }) => `“${b.t}” (${WD[weekday(d)]}${b.allDay ? '' : ', ' + ctx.clock(b.start)})`).join(', ');
        add(Math.max(pen, -6), `Clashes with ${shown}${clashes.length > 2 ? ` and ${clashes.length - 2} more` : ''}`);
      }
    }

    const score = Math.round(reasons.reduce((s, r) => s + r.pts, 0) * 10) / 10;
    return { start, end: days[days.length - 1], days, score, reasons };
  }

  function rating(score) {
    if (score >= 4) return 'Excellent';
    if (score >= 2) return 'Very good';
    if (score >= 0) return 'Good';
    return 'Possible';
  }

  // Best few non-overlapping options between `from` and `to` (start dates)
  function suggest(o, ctx, limit = 5) {
    const cands = [];
    for (let d = o.from, i = 0; d <= o.to && i < 400; d = addDays(d, 1), i++) {
      if (o.startDays && o.startDays.length && !o.startDays.includes(weekday(d))) continue;
      cands.push(scoreStart(d, o, ctx));
    }
    cands.sort((a, b) => b.score - a.score || a.start.localeCompare(b.start));
    const picked = [];
    for (const c of cands) {
      if (picked.some(p => !(c.end < p.start || c.start > p.end))) continue;
      picked.push({ ...c, rating: rating(c.score) });
      if (picked.length >= limit) break;
    }
    return { options: picked, considered: cands.length };
  }

  global.CoursePlanner = { PRESETS, suggest, scoreStart, rating };
})(typeof window !== 'undefined' ? window : globalThis);
