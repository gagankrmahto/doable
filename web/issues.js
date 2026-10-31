/* Doable — issue tracking for projects: bugs, feature requests (RFEs) and chores, each with a status.
 * Pure data helpers shared by the app, the MCP server and the tests. An issue:
 * { id, projectId, type, title, desc, status, severity, priority, reporter, version, fixVersion, link, createdAt, updatedAt, closedAt, history } */
(function (global) {
  'use strict';

  const TYPES = [
    { v: 'bug', label: 'Bug', emoji: '🐞', color: '#e5484d' },
    { v: 'feature', label: 'Feature', emoji: '✨', color: '#7b68ee', hint: 'RFE / enhancement' },
    { v: 'task', label: 'Chore', emoji: '🔧', color: '#8a90a0' },
  ];
  const STATUSES = [
    { v: 'open', label: 'Open', color: '#f5a524', open: true },
    { v: 'progress', label: 'In progress', color: '#5b6cf9', open: true },
    { v: 'fixed', label: 'Fixed', color: '#12a594', open: false, hint: 'Done, awaiting a check' },
    { v: 'verified', label: 'Verified', color: '#1db67f', open: false },
    { v: 'closed', label: 'Closed', color: '#6f6e77', open: false },
    { v: 'wontfix', label: "Won't fix", color: '#98a2b3', open: false },
  ];
  const SEVERITIES = ['critical', 'major', 'minor'];
  const PRIORITIES = ['high', 'normal', 'low'];
  const typeOf = v => TYPES.find(t => t.v === v) || TYPES[0];
  const statusOf = v => STATUSES.find(s => s.v === v) || STATUSES[0];
  const isOpen = i => statusOf(i.status).open;

  // Normalise anything that claims to be an issue; returns null if unusable
  function from(x) {
    if (!x || !x.id || !x.projectId) return null;
    const o = {
      id: String(x.id), projectId: String(x.projectId), type: TYPES.some(t => t.v === x.type) ? x.type : 'bug',
      title: String(x.title || '').trim().slice(0, 200) || 'Untitled', desc: String(x.desc || '').slice(0, 8000),
      status: STATUSES.some(s => s.v === x.status) ? x.status : 'open',
      createdAt: Number(x.createdAt) || Date.now(), updatedAt: Number(x.updatedAt) || Number(x.createdAt) || Date.now(),
      history: Array.isArray(x.history) ? x.history.slice(-50) : [],
    };
    if (o.type === 'bug') o.severity = SEVERITIES.includes(x.severity) ? x.severity : 'major';
    else o.priority = PRIORITIES.includes(x.priority) ? x.priority : 'normal';
    for (const k of ['reporter', 'version', 'fixVersion', 'link', 'env']) if (x[k]) o[k] = String(x[k]).slice(0, 200);
    if (x.closedAt) o.closedAt = Number(x.closedAt);
    if (x.taskId) o.taskId = String(x.taskId);
    return o;
  }

  // Apply a change, recording status moves in the history
  function change(issue, patch, who = 'me') {
    const n = { ...issue, ...patch, updatedAt: Date.now() };
    if (patch.status && patch.status !== issue.status) {
      n.history = [...(issue.history || []), { at: Date.now(), from: issue.status, to: patch.status, by: who, ...(patch.note && { note: patch.note }) }].slice(-50);
      n.closedAt = statusOf(patch.status).open ? undefined : Date.now();
      if (!n.closedAt) delete n.closedAt;
    }
    delete n.note;
    return from(n);
  }

  // Sort: open before closed; within open, bugs by severity then newest; closed newest first
  const sevRank = { critical: 0, major: 1, minor: 2 };
  const prioRank = { high: 0, normal: 1, low: 2 };
  function sort(list) {
    return [...list].sort((a, b) => {
      const ao = isOpen(a), bo = isOpen(b);
      if (ao !== bo) return ao ? -1 : 1;
      if (ao) {
        const ar = a.type === 'bug' ? sevRank[a.severity] : 3 + prioRank[a.priority];
        const br = b.type === 'bug' ? sevRank[b.severity] : 3 + prioRank[b.priority];
        if (ar !== br) return ar - br;
      }
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }

  function summary(list) {
    const s = { total: list.length, open: 0, openBugs: 0, openFeatures: 0, critical: 0, fixed: 0, closed: 0 };
    for (const i of list) {
      if (isOpen(i)) { s.open++; if (i.type === 'bug') { s.openBugs++; if (i.severity === 'critical') s.critical++; } else if (i.type === 'feature') s.openFeatures++; }
      else if (i.status === 'fixed') s.fixed++;
      else s.closed++;
    }
    return s;
  }

  // Issue-based health 0..100: share of issues resolved, critical bugs weigh more
  function health(list) {
    if (!list.length) return null;
    let weight = 0, done = 0;
    for (const i of list) { const w = i.type === 'bug' && i.severity === 'critical' ? 3 : i.type === 'bug' ? 2 : 1; weight += w; if (!isOpen(i)) done += w; }
    return Math.round((done / weight) * 100);
  }

  global.Issues = { TYPES, STATUSES, SEVERITIES, PRIORITIES, typeOf, statusOf, isOpen, from, change, sort, summary, health };
})(typeof window !== 'undefined' ? window : globalThis);
