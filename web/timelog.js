/* Doable — time tracking helpers. A task carries `logs: [{ s, e?, n? }]` (start ms, end ms, note);
 * a log without `e` is the running timer. Pure functions shared by the app, the MCP server and tests. */
(function (global) {
  'use strict';

  const DAY = 86400000;
  const logsOf = t => (Array.isArray(t.logs) ? t.logs : []);
  const running = t => logsOf(t).find(l => !l.e) || null;
  const ms = (logs, now = Date.now()) => logs.reduce((s, l) => s + Math.max(0, (l.e || now) - l.s), 0);
  const hours = (logs, now) => Math.round(ms(logs, now) / 36000) / 100;

  // Logs overlapping [from, to) ms, clipped to the window
  function within(logs, from, to, now = Date.now()) {
    const out = [];
    for (const l of logs) {
      const s = Math.max(l.s, from), e = Math.min(l.e || now, to);
      if (e > s) out.push({ ...l, s, e });
    }
    return out;
  }
  const localDayStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const weekStart = (weekStartsOn = 1, d = new Date()) => { const t = localDayStart(d); const dow = new Date(t).getDay(); return t - ((dow - weekStartsOn + 7) % 7) * DAY; };

  // "1h 20m", "45m", "2h"
  function fmt(msTotal) {
    const m = Math.round(msTotal / 60000);
    if (m < 1) return '0m';
    const h = Math.floor(m / 60), r = m % 60;
    return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
  }
  const clock = (msTotal) => { const s = Math.floor(msTotal / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

  function start(t, now = Date.now()) {
    if (running(t)) return t;
    return { ...t, logs: [...logsOf(t), { s: now }] };
  }
  function stop(t, now = Date.now(), note) {
    const r = running(t);
    if (!r) return t;
    const logs = logsOf(t).map(l => (l === r ? { ...l, e: Math.max(now, l.s + 1000), ...(note && { n: note }) } : l));
    return { ...t, logs: logs.filter(l => l.e - l.s >= 30000) }; // a timer stopped within 30 s was a mis-tap
  }
  function add(t, minutes, { end = Date.now(), note } = {}) {
    const dur = Math.round(minutes) * 60000;
    if (dur <= 0) return t;
    return { ...t, logs: [...logsOf(t), { s: end - dur, e: end, ...(note && { n: note }) }] };
  }
  const remove = (t, index) => ({ ...t, logs: logsOf(t).filter((_, i) => i !== index) });

  // Totals for a set of tasks: all time, today, this week; plus the running one
  function totals(tasks, { weekStartsOn = 1, now = Date.now() } = {}) {
    const all = tasks.flatMap(logsOf);
    const d0 = localDayStart(new Date(now)), w0 = weekStart(weekStartsOn, new Date(now));
    return { ms: ms(all, now), today: ms(within(all, d0, d0 + DAY, now), now), week: ms(within(all, w0, w0 + 7 * DAY, now), now), running: tasks.find(running) || null };
  }

  global.TimeLog = { logsOf, running, ms, hours, within, fmt, clock, start, stop, add, remove, totals, localDayStart, weekStart };
})(typeof window !== 'undefined' ? window : globalThis);
