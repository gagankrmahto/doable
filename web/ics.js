/* Doable — iCalendar (.ics) reader for Google Calendar's "secret address in iCal format" (also Outlook/iCloud).
 * Handles all-day and timed events, TZID time zones (incl. DST), RRULE recurrence (DAILY/WEEKLY/MONTHLY/YEARLY
 * with INTERVAL, COUNT, UNTIL, BYDAY incl. "2TU"/"-1FR", BYMONTHDAY, BYMONTH), EXDATE, moved/cancelled
 * occurrences (RECURRENCE-ID) and meeting links (Google Meet, Zoom, Teams…). */
(function (global) {
  'use strict';

  const pad = n => String(n).padStart(2, '0');
  const DAY = 86400000;
  const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  // Offset (ms) of an IANA time zone from UTC at a given instant
  const fmtCache = new Map();
  function tzOffset(ms, tz) {
    let f = fmtCache.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      fmtCache.set(tz, f);
    }
    const p = {};
    for (const part of f.formatToParts(new Date(ms))) p[part.type] = part.value;
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
  }
  // Wall-clock time in a zone → UTC ms. Falls back to the device zone for unknown (e.g. Windows) zone names.
  function zonedToUtc(y, mo, d, h, mi, s, tz) {
    if (!tz) return new Date(y, mo - 1, d, h, mi, s).getTime();
    try {
      const guess = Date.UTC(y, mo - 1, d, h, mi, s);
      let utc = guess - tzOffset(guess, tz);
      utc = guess - tzOffset(utc, tz); // second pass handles DST boundaries
      return utc;
    } catch { return new Date(y, mo - 1, d, h, mi, s).getTime(); }
  }

  // "20261020T093000Z" | "20261020T093000" (+TZID) | "20261020" (all-day)
  function parseDate(value, params) {
    const m = String(value).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    if (!h || /VALUE=DATE(?!-)/i.test(params || '')) return { allDay: true, y: +y, mo: +mo, d: +d };
    const tz = z ? 'UTC' : ((params || '').match(/TZID=("?)([^";:]+)\1/i) || [])[2] || null;
    return { allDay: false, y: +y, mo: +mo, d: +d, h: +h, mi: +mi, s: +(s || 0), tz };
  }
  const toMs = p => (p.allDay ? new Date(p.y, p.mo - 1, p.d).getTime() : zonedToUtc(p.y, p.mo, p.d, p.h, p.mi, p.s, p.tz === 'UTC' ? 'UTC' : p.tz));

  function parseDuration(v) {
    const m = String(v || '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!m) return 0;
    const ms = (+m[2] || 0) * 7 * DAY + (+m[3] || 0) * DAY + (+m[4] || 0) * 3600000 + (+m[5] || 0) * 60000 + (+m[6] || 0) * 1000;
    return m[1] === '-' ? -ms : ms;
  }

  const unescape = s => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  const LINK_RE = /https:\/\/(?:meet\.google\.com\/[a-z0-9-]+|(?:[\w-]+\.)?zoom\.us\/[^\s"<>]+|teams\.(?:microsoft|live)\.com\/[^\s"<>]+|[\w-]+\.webex\.com\/[^\s"<>]+|meet\.jit\.si\/[^\s"<>]+)/i;

  function parseIcs(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const events = [];
    let ev = null;
    let calName = '';
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { ev = { exdates: [] }; continue; }
      if (line === 'END:VEVENT') { if (ev && ev.start) events.push(ev); ev = null; continue; }
      const i = line.indexOf(':');
      if (i < 0) continue;
      const left = line.slice(0, i);
      const value = line.slice(i + 1);
      const semi = left.indexOf(';');
      const name = (semi < 0 ? left : left.slice(0, semi)).toUpperCase();
      const params = semi < 0 ? '' : left.slice(semi + 1);
      if (!ev) { if (name === 'X-WR-CALNAME') calName = unescape(value); continue; }
      switch (name) {
        case 'UID': ev.uid = value; break;
        case 'SUMMARY': ev.title = unescape(value); break;
        case 'DESCRIPTION': ev.description = unescape(value); break;
        case 'LOCATION': ev.location = unescape(value); break;
        case 'STATUS': ev.status = value.toUpperCase(); break;
        case 'DTSTART': ev.start = parseDate(value, params); break;
        case 'DTEND': ev.end = parseDate(value, params); break;
        case 'DURATION': ev.duration = parseDuration(value); break;
        case 'RRULE': ev.rrule = Object.fromEntries(value.split(';').map(kv => kv.split('=')).map(([k, v]) => [k.toUpperCase(), v])); break;
        case 'EXDATE': value.split(',').forEach(v => { const p = parseDate(v, params); if (p) ev.exdates.push(p); }); break;
        case 'RECURRENCE-ID': ev.recurrenceId = parseDate(value, params); break;
        case 'X-GOOGLE-CONFERENCE': ev.link = value; break;
        case 'URL': if (!ev.url) ev.url = value; break;
      }
    }
    return { name: calName, events };
  }

  // Calendar-date helpers on {y, mo, d}
  const fromYmd = (y, mo, d) => { const t = new Date(Date.UTC(y, mo - 1, d)); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
  const weekday = (y, mo, d) => new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const daysIn = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const keyOf = p => `${p.y}${pad(p.mo)}${pad(p.d)}${p.allDay ? '' : 'T' + pad(p.h) + pad(p.mi)}`;

  // nth weekday of a month ("2TU", "-1FR") → day number or null
  function nthWeekday(y, mo, spec) {
    const m = spec.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
    if (!m) return [];
    const wd = WD[m[2]];
    const all = [];
    for (let d = 1; d <= daysIn(y, mo); d++) if (weekday(y, mo, d) === wd) all.push(d);
    if (!m[1]) return all;
    const n = +m[1];
    const d = n > 0 ? all[n - 1] : all[all.length + n];
    return d ? [d] : [];
  }

  // Occurrence start dates (wall clock) of a recurring event, oldest first
  function* occurrences(ev, untilMs) {
    const s = ev.start;
    const r = ev.rrule;
    if (!r) { yield s; return; }
    const freq = r.FREQ;
    const interval = Math.max(1, +r.INTERVAL || 1);
    const count = r.COUNT ? +r.COUNT : Infinity;
    const until = r.UNTIL ? toMs(parseDate(r.UNTIL, /T.*Z$/.test(r.UNTIL) ? '' : (s.tz ? `TZID=${s.tz}` : ''))) : Infinity;
    const byDay = r.BYDAY ? r.BYDAY.split(',') : null;
    const byMonthDay = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null;
    const byMonth = r.BYMONTH ? r.BYMONTH.split(',').map(Number) : null;
    const startMs = toMs(s);
    const at = (y, mo, d) => ({ ...s, y, mo, d });
    let emitted = 0;
    const emit = function* (dates) {
      for (const p of dates.sort((a, b) => toMs(a) - toMs(b))) {
        const ms = toMs(p);
        if (ms < startMs) continue;
        if (ms > until || emitted >= count || ms > untilMs) return 'stop';
        emitted++;
        yield p;
      }
    };
    for (let i = 0; i < 5000; i++) {
      let dates = [];
      if (freq === 'DAILY') {
        const t = fromYmd(s.y, s.mo, s.d + i * interval);
        if (!byMonth || byMonth.includes(t.mo)) dates = [at(t.y, t.mo, t.d)];
      } else if (freq === 'WEEKLY') {
        const wk = fromYmd(s.y, s.mo, s.d - weekday(s.y, s.mo, s.d) + i * 7 * interval); // Sunday of that week
        const wds = byDay ? byDay.map(x => WD[x.slice(-2)]) : [weekday(s.y, s.mo, s.d)];
        dates = wds.map(w => { const t = fromYmd(wk.y, wk.mo, wk.d + w); return at(t.y, t.mo, t.d); });
      } else if (freq === 'MONTHLY') {
        const t = fromYmd(s.y, s.mo + i * interval, 1);
        let days = byDay ? byDay.flatMap(x => nthWeekday(t.y, t.mo, x)) : byMonthDay ? byMonthDay.map(n => (n < 0 ? daysIn(t.y, t.mo) + n + 1 : n)) : [s.d];
        days = days.filter(d => d >= 1 && d <= daysIn(t.y, t.mo));
        dates = days.map(d => at(t.y, t.mo, d));
      } else if (freq === 'YEARLY') {
        const y = s.y + i * interval;
        const months = byMonth || [s.mo];
        for (const mo of months) {
          let days = byDay ? byDay.flatMap(x => nthWeekday(y, mo, x)) : byMonthDay ? byMonthDay : [s.d];
          days = days.filter(d => d >= 1 && d <= daysIn(y, mo));
          dates.push(...days.map(d => at(y, mo, d)));
        }
      } else { yield s; return; }
      const res = yield* emit(dates);
      if (res === 'stop') return;
    }
  }

  // Expand a feed into concrete events overlapping [fromMs, toMs]
  function eventsBetween(feed, fromMs, untilMs) {
    const out = [];
    const overrides = new Map();
    for (const ev of feed.events) if (ev.recurrenceId && ev.uid) overrides.set(`${ev.uid}|${keyOf(ev.recurrenceId)}`, ev);
    const push = (ev, startP) => {
      if (ev.status === 'CANCELLED') return;
      const start = toMs(startP);
      let dur = ev.end ? toMs(ev.end) - toMs(ev.start) : ev.duration || (startP.allDay ? DAY : 0);
      if (dur < 0) dur = 0;
      const end = start + dur;
      if (end < fromMs || start > untilMs) return;
      const text = `${ev.location || ''} ${ev.description || ''} ${ev.url || ''}`;
      const link = ev.link || (text.match(LINK_RE) || [])[0] || null;
      out.push({ uid: ev.uid, title: ev.title || '(No title)', start, end, allDay: !!startP.allDay, location: ev.location || '', link });
    };
    for (const ev of feed.events) {
      if (ev.recurrenceId) continue; // handled via overrides
      const ex = new Set(ev.exdates.map(keyOf));
      for (const p of occurrences(ev, untilMs)) {
        const k = keyOf(p);
        if (ex.has(k) || ex.has(k.slice(0, 8))) continue;
        const ov = overrides.get(`${ev.uid}|${k}`);
        if (ov) { overrides.delete(`${ev.uid}|${k}`); push(ov, ov.start); } else push(ev, p);
      }
    }
    for (const ov of overrides.values()) push(ov, ov.start); // moved occurrences without a matching rule date
    return out.sort((a, b) => a.start - b.start);
  }

  global.Ics = { parseIcs, eventsBetween, zonedToUtc };
})(typeof window !== 'undefined' ? window : globalThis);
