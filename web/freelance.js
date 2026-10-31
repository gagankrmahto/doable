/* Doable — freelance projects: the numbers behind the Freelance space.
 * A project is a list with `project: 'freelance'` plus client/status/money fields; its top-level tasks
 * are the milestones. Pure functions over plain data, so the app and the tests share them. */
(function (global) {
  'use strict';

  const STATUSES = [
    { v: 'lead', label: 'Lead', color: '#98a2b3', hint: 'Talking, nothing agreed yet' },
    { v: 'proposal', label: 'Proposal', color: '#f5a524', hint: 'Quote or proposal sent' },
    { v: 'active', label: 'In progress', color: '#5b6cf9', hint: 'Work is under way' },
    { v: 'delivered', label: 'Delivered', color: '#12a594', hint: 'Handed over, awaiting payment' },
    { v: 'paid', label: 'Paid', color: '#1db67f', hint: 'Money received' },
    { v: 'closed', label: 'Closed', color: '#6f6e77', hint: 'Finished or dropped' },
  ];
  const OPEN = new Set(['lead', 'proposal', 'active', 'delivered']);
  const STALE_DAYS = 7;
  const DAY = 86400000;

  const statusOf = v => STATUSES.find(s => s.v === v) || STATUSES[0];
  const isOpen = p => OPEN.has(p.status || 'lead');

  // Milestones = top-level tasks; a milestone counts as done when it and all its subtasks are done
  function progress(tasks) {
    const top = tasks.filter(t => !t.parentId);
    const done = top.filter(t => t.done).length;
    const all = tasks.length;
    const allDone = tasks.filter(t => t.done).length;
    return { milestones: top.length, done, pct: all ? Math.round((allDone / all) * 100) : 0 };
  }

  // Last moment anything happened on the project (a task added, edited or completed)
  function lastActivity(project, tasks) {
    let last = project.updatedAt || project.createdAt || 0;
    for (const t of tasks) last = Math.max(last, t.updatedAt || t.createdAt || 0, t.doneAt || 0);
    return last;
  }
  const daysSince = (ms, now = Date.now()) => Math.floor((now - ms) / DAY);
  // Active work that nobody has touched for a week is at risk of being forgotten
  const isStale = (project, tasks, now = Date.now()) => project.status === 'active' && daysSince(lastActivity(project, tasks), now) >= STALE_DAYS;

  // What needs attention, most urgent first: overdue, due soon, stale, delivered-but-unpaid
  function alerts(projects, tasksOf, today, now = Date.now()) {
    const out = [];
    const soon = new Date(today); soon.setDate(soon.getDate() + 3);
    const soonStr = soon.toISOString().slice(0, 10);
    for (const p of projects) {
      if (!isOpen(p)) continue;
      const tasks = tasksOf(p.id);
      if (p.due && p.due < today && p.status !== 'delivered') out.push({ level: 2, project: p, text: `Overdue since ${p.due}` });
      else if (p.due && p.due <= soonStr && p.status !== 'delivered') out.push({ level: 1, project: p, text: p.due === today ? 'Due today' : `Due ${p.due}` });
      if (isStale(p, tasks, now)) out.push({ level: 1, project: p, text: `No activity for ${daysSince(lastActivity(p, tasks), now)} days` });
      if (p.status === 'delivered' && (p.price || 0) > (p.paid || 0)) out.push({ level: 0, project: p, text: `${money(p.price - (p.paid || 0))} unpaid` });
    }
    return out.sort((a, b) => b.level - a.level);
  }

  function money(n, currency = '₹') {
    const v = Number(n) || 0;
    return currency + (Math.abs(v) >= 100000 ? (v / 100000).toFixed(v % 100000 ? 1 : 0) + ' L' : v.toLocaleString('en-IN'));
  }

  function totals(projects) {
    const t = { open: 0, quoted: 0, billed: 0, paid: 0, due: 0 };
    for (const p of projects) {
      const price = Number(p.price) || 0, paid = Number(p.paid) || 0;
      if (isOpen(p)) t.open++;
      if (p.status === 'lead' || p.status === 'proposal') t.quoted += price;
      if (p.status === 'active' || p.status === 'delivered' || p.status === 'paid' || p.status === 'closed') t.billed += price;
      t.paid += paid;
      if (p.status === 'delivered' || p.status === 'active') t.due += Math.max(0, price - paid);
    }
    return t;
  }

  // Hours from time logs [{start, end}] (end missing = still running)
  const hours = (logs, now = Date.now()) => Math.round(logs.reduce((s, l) => s + ((l.end || now) - l.start), 0) / 36000) / 100;

  global.Freelance = { STATUSES, statusOf, isOpen, progress, lastActivity, isStale, alerts, money, totals, hours, STALE_DAYS };
})(typeof window !== 'undefined' ? window : globalThis);
