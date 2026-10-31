/* Doable MCP tools, shared by the local server (Firebase client SDK) and the cloud function (Admin SDK).
 * `store` = { records: Map<id, { kind, data }>, write(rows: [{ id, kind, data|null }]) → Promise, connect() → Promise } */
import { z } from 'zod';
import '../web/issues.js';
import '../web/timelog.js';
const Issues = globalThis.Issues;
const TimeLog = globalThis.TimeLog;

const uid6 = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (day, n) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return todayStr(d); };

export function registerTools(server, store) {
const records = store.records;
const write = rows => store.write(rows);
const connect = () => store.connect();
const tasks = () => [...records].filter(([k]) => k.startsWith('task:')).map(([, v]) => v.data);
const lists = () => [...records].filter(([k]) => k.startsWith('list:')).map(([, v]) => v.data).sort((a, b) => (a.pos || 0) - (b.pos || 0));
const practices = () => [...records].filter(([k]) => k.startsWith('practice:')).map(([, v]) => v.data).filter(p => !p.archived);
const settings = () => (records.get('settings') || { data: {} }).data;
const getTask = id => tasks().find(t => t.id === id);
const findList = name => {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  return lists().find(l => l.id === name) || lists().find(l => l.name.toLowerCase() === n) || lists().find(l => l.name.toLowerCase().includes(n)) || null;
};
const defaultList = () => lists().find(l => l.id === settings().defaultListId) || lists()[0];
const PRIO = { urgent: 1, high: 2, normal: 3, low: 4, none: 0 };
const PRIO_NAME = { 1: 'urgent', 2: 'high', 3: 'normal', 4: 'low' };
const listName = id => (lists().find(l => l.id === id) || {}).name || null;
function newTask(o) {
  return {
    id: uid6(), listId: null, parentId: null, title: '', notes: '', due: null, time: null, priority: 0, status: 'todo', starred: false, tags: [],
    repeat: null, remind: null, myDay: null, done: false, doneAt: null, createdAt: Date.now(), updatedAt: Date.now(), order: 0, collapsed: false,
    notifiedFor: null, type: 'task', link: null, duration: null, ...o,
  };
}
const view = t => ({
  id: t.id, title: t.title, list: listName(t.listId), status: t.status, done: !!t.done,
  ...(t.due && { due: t.due }), ...(t.time && { time: t.time }), ...(t.priority && { priority: PRIO_NAME[t.priority] }),
  ...(t.tags && t.tags.length && { tags: t.tags }), ...(t.starred && { starred: true }), ...(t.parentId && { parent_id: t.parentId }),
  ...(t.repeat && { repeat: t.repeat.freq === 'monthly' && t.repeat.interval === 3 ? 'quarterly' : t.repeat.freq === 'monthly' && t.repeat.interval === 6 ? 'halfyearly' : t.repeat.interval === 1 ? t.repeat.freq : `every ${t.repeat.interval} ${t.repeat.freq}` }),
  ...(t.notes && { notes: t.notes.slice(0, 300) }), ...(t.type === 'meeting' && { meeting: { minutes: t.duration || 30, link: t.link || null } }),
  ...(TimeLog.logsOf(t).length && { time: { hours: TimeLog.hours(TimeLog.logsOf(t)), ...(TimeLog.running(t) && { running: true }) } }),
});
const projects = () => lists().filter(l => l.project);
const progress = p => { const ts = tasks().filter(t => t.listId === p.id); const top = ts.filter(t => !t.parentId); return { milestones: top.length, done: top.filter(t => t.done).length, pct: ts.length ? Math.round(ts.filter(t => t.done).length / ts.length * 100) : 0 }; };
const issuesOf = pid => [...records].filter(([k]) => k.startsWith('issue:')).map(([, v]) => v.data).filter(i => i.projectId === pid);
const findProject = name => { const n = String(name || '').trim().toLowerCase(); return projects().find(p => p.id === name) || projects().find(p => p.name.toLowerCase() === n) || projects().find(p => p.name.toLowerCase().includes(n)) || null; };
const issueView = x => ({ id: x.id, type: x.type, title: x.title, status: x.status, ...(x.type === 'bug' ? { severity: x.severity } : { priority: x.priority }), ...(x.reporter && { reporter: x.reporter }), ...(x.version && { found_in: x.version }), ...(x.fixVersion && { fixed_in: x.fixVersion }), ...(x.link && { link: x.link }), ...(x.desc && { details: x.desc.slice(0, 600) }), updated: new Date(x.updatedAt).toISOString().slice(0, 10) });
const projectView = p => ({ id: p.id, name: p.name, client: p.client || null, status: p.status || 'lead', due: p.due || null, price: p.price || 0, paid: p.paid || 0, ...(p.link && { link: p.link }), ...(p.repo && { repo: p.repo }), ...(p.stack && { stack: p.stack }), ...(p.notes && { notes: p.notes }), progress: progress(p), hours_logged: TimeLog.hours(tasks().filter(t => t.listId === p.id).flatMap(TimeLog.logsOf)), issues: (() => { const sm = Issues.summary(issuesOf(p.id)); return { open_bugs: sm.openBugs, open_features: sm.openFeatures, critical: sm.critical, resolved: sm.fixed + sm.closed }; })() });
const text = v => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const fail = m => ({ content: [{ type: 'text', text: m }], isError: true });
const D = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const HM = z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM');

/* ---------- Tools ---------- */

server.registerTool('get_overview', {
  title: 'Overview',
  description: 'Summary of the Doable workspace: today\'s date, lists and spaces, open/overdue counts, projects with status and progress, habits. Call first to learn list names and project ids.',
  inputSchema: {},
}, async () => {
  try { await connect(); } catch (e) { return fail(e.message); }
  const T = todayStr();
  const top = tasks().filter(t => !t.parentId && !t.done);
  return text({
    today: T,
    lists: lists().map(l => ({ id: l.id, name: l.name, ...(l.space && { space: l.space }), ...(l.project && { project: true }), open_tasks: top.filter(t => t.listId === l.id).length })),
    default_list: (defaultList() || {}).name,
    counts: { overdue: top.filter(t => t.due && t.due < T).length, due_today: top.filter(t => t.due === T).length, next_7_days: top.filter(t => t.due > T && t.due <= shift(T, 7)).length, no_date: top.filter(t => !t.due).length },
    projects: projects().map(projectView),
    habits: practices().map(p => ({ id: p.id, name: p.name, type: p.type || 'check', ...(p.type === 'count' && { target: p.target, unit: p.unit }) })),
    time: (() => { const tt = TimeLog.totals(tasks(), { weekStartsOn: settings().weekStart ?? 1 }); return { today: TimeLog.fmt(tt.today), this_week: TimeLog.fmt(tt.week), ...(tt.running && { running: { id: tt.running.id, title: tt.running.title } }) }; })(),
  });
});

server.registerTool('search_tasks', {
  title: 'Search tasks',
  description: 'Find tasks by words, list/project, status, tag, due range or overdue. Returns ids needed by update_tasks.',
  inputSchema: {
    query: z.string().optional(), list: z.string().optional().describe('List, space or project name'),
    status: z.enum(['todo', 'progress', 'review', 'done']).optional(), tag: z.string().optional(),
    due_from: D.optional(), due_to: D.optional(), overdue: z.boolean().optional(), include_done: z.boolean().optional(), limit: z.number().int().min(1).max(200).optional(),
  },
}, async i => {
  try { await connect(); } catch (e) { return fail(e.message); }
  const T = todayStr();
  const l = i.list ? findList(i.list) : null;
  if (i.list && !l) return fail(`No list called "${i.list}". Lists: ${lists().map(x => x.name).join(', ')}`);
  const q = (i.query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const out = tasks().filter(t => (i.include_done || i.status === 'done' || !t.done)
    && (!l || t.listId === l.id) && (!i.status || t.status === i.status)
    && (!i.tag || (t.tags || []).includes(i.tag.replace(/^#/, '').toLowerCase()))
    && (!i.due_from || (t.due && t.due >= i.due_from)) && (!i.due_to || (t.due && t.due <= i.due_to))
    && (!i.overdue || (t.due && t.due < T && !t.done))
    && q.every(w => `${t.title} ${t.notes || ''} ${(t.tags || []).join(' ')}`.toLowerCase().includes(w)))
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99'));
  const lim = i.limit || 50;
  return text({ count: out.length, tasks: out.slice(0, lim).map(view) });
});

const taskInput = z.object({
  title: z.string().min(1).max(300), list: z.string().optional().describe('List, space or project name; default list if omitted'),
  due: D.optional(), time: HM.optional(), duration_minutes: z.number().int().min(5).max(1440).optional(), link: z.string().url().optional(),
  priority: z.enum(['urgent', 'high', 'normal', 'low']).optional(), notes: z.string().max(4000).optional(), tags: z.array(z.string()).max(10).optional(),
  starred: z.boolean().optional(), repeat: z.enum(['daily', 'weekdays', 'weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly']).optional(),
  remind_minutes_before: z.number().int().min(0).max(10080).optional(), parent_id: z.string().optional().describe('Make it a subtask of this task'),
});
server.registerTool('create_tasks', {
  title: 'Create tasks',
  description: 'Add tasks, meetings (give duration_minutes or a call link) or subtasks. For a project milestone, set list to the project name.',
  inputSchema: { tasks: z.array(taskInput).min(1).max(50) },
}, async i => {
  try { await connect(); } catch (e) { return fail(e.message); }
  const made = [];
  for (const x of i.tasks) {
    const parent = x.parent_id ? getTask(x.parent_id) : null;
    if (x.parent_id && !parent) return fail(`No task with id ${x.parent_id}`);
    const l = parent ? lists().find(z => z.id === parent.listId) : (x.list ? findList(x.list) : defaultList());
    if (!l) return fail(`No list called "${x.list}". Lists: ${lists().map(z => z.name).join(', ')}`);
    const meeting = !!(x.duration_minutes || (x.link && /meet\.google|zoom\.us|teams\.|webex|jit\.si/i.test(x.link)));
    const siblings = tasks().filter(t => t.parentId === (parent ? parent.id : null) && (parent || t.listId === l.id));
    const order = siblings.length ? Math.min(...siblings.map(t => t.order || 0)) - 1 : 0;
    made.push(newTask({
      title: x.title.trim(), listId: l.id, parentId: parent ? parent.id : null, due: x.due || (x.repeat ? todayStr() : null), time: x.time || null,
      priority: x.priority ? PRIO[x.priority] : 0, notes: [x.notes, x.link && !meeting ? x.link : ''].filter(Boolean).join('\n'),
      tags: (x.tags || []).map(g => g.replace(/^#/, '').toLowerCase()).filter(Boolean), starred: !!x.starred,
      repeat: x.repeat ? { freq: x.repeat === 'quarterly' || x.repeat === 'halfyearly' ? 'monthly' : x.repeat, interval: x.repeat === 'quarterly' ? 3 : x.repeat === 'halfyearly' ? 6 : 1 } : null, remind: x.remind_minutes_before != null && (x.due || x.repeat) ? x.remind_minutes_before : null,
      type: meeting ? 'meeting' : 'task', link: meeting ? x.link : null, duration: meeting ? x.duration_minutes || 30 : null, order,
    }));
  }
  await write(made.map(t => ({ id: 'task:' + t.id, kind: 'task', data: t })));
  return text({ created: made.map(view) });
});

server.registerTool('update_tasks', {
  title: 'Update tasks',
  description: 'Change, reschedule, move, complete, reopen or delete tasks by id. done=true completes (a repeating task gets its next occurrence); delete=true removes it and its subtasks.',
  inputSchema: {
    updates: z.array(z.object({
      id: z.string(), title: z.string().max(300).optional(), due: D.nullable().optional(), time: HM.nullable().optional(),
      duration_minutes: z.number().int().min(5).max(1440).optional(), status: z.enum(['todo', 'progress', 'review', 'done']).optional(), done: z.boolean().optional(),
      priority: z.enum(['urgent', 'high', 'normal', 'low', 'none']).optional(), list: z.string().optional(), notes: z.string().max(4000).optional(),
      tags: z.array(z.string()).max(10).optional(), starred: z.boolean().optional(), link: z.string().nullable().optional(), delete: z.boolean().optional(),
    })).min(1).max(100),
  },
}, async i => {
  try { await connect(); } catch (e) { return fail(e.message); }
  const rows = [];
  const out = [];
  for (const u of i.updates) {
    const t = getTask(u.id);
    if (!t) return fail(`No task with id ${u.id}`);
    if (u.delete) {
      for (const k of tasks().filter(x => x.parentId === t.id)) rows.push({ id: 'task:' + k.id, kind: 'task', data: null });
      rows.push({ id: 'task:' + t.id, kind: 'task', data: null });
      out.push({ id: t.id, deleted: true });
      continue;
    }
    const n = { ...t, updatedAt: Date.now() };
    if (u.title) n.title = u.title.trim();
    if ('due' in u) n.due = u.due;
    if ('time' in u) n.time = u.time;
    if (u.duration_minutes) { n.duration = u.duration_minutes; n.type = 'meeting'; }
    if (u.priority) n.priority = PRIO[u.priority];
    if (u.list) { const l = findList(u.list); if (!l) return fail(`No list called "${u.list}"`); if (!n.parentId) n.listId = l.id; }
    if ('notes' in u) n.notes = u.notes;
    if (u.tags) n.tags = u.tags.map(g => g.replace(/^#/, '').toLowerCase()).filter(Boolean);
    if ('starred' in u) n.starred = u.starred;
    if ('link' in u) { n.link = u.link; if (u.link) n.type = 'meeting'; }
    const wantDone = u.done === true || u.status === 'done';
    if (wantDone && !n.done) {
      n.done = true; n.status = 'done'; n.doneAt = Date.now();
      if (n.repeat && !n.parentId) { // next occurrence
        const d = new Date((n.due || todayStr()) + 'T12:00:00'); const k = n.repeat.interval || 1;
        const step = () => { switch (n.repeat.freq) { case 'daily': d.setDate(d.getDate() + k); break; case 'weekdays': do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); break; case 'weekly': d.setDate(d.getDate() + 7 * k); break; case 'monthly': d.setMonth(d.getMonth() + k); break; case 'yearly': d.setFullYear(d.getFullYear() + k); break; default: d.setDate(d.getDate() + 1); } };
        do step(); while (todayStr(d) <= todayStr());
        const next = newTask({ ...n, id: uid6(), done: false, status: 'todo', doneAt: null, createdAt: Date.now(), due: todayStr(d), notifiedFor: null, myDay: null });
        rows.push({ id: 'task:' + next.id, kind: 'task', data: next });
        out.push({ next_occurrence: view(next) });
      }
    } else if ((u.done === false || (u.status && u.status !== 'done')) && n.done) { n.done = false; n.status = 'todo'; n.doneAt = null; }
    if (u.status && u.status !== 'done') n.status = u.status;
    rows.push({ id: 'task:' + n.id, kind: 'task', data: n });
    out.push(view(n));
  }
  await write(rows);
  return text({ updated: out });
});

server.registerTool('update_project', {
  title: 'Create or update a freelance project',
  description: 'Create a project in the Freelance space or update one (status, client, deadline, price, payments, links, notes). Milestones are tasks in the project: use create_tasks with list = project name.',
  inputSchema: {
    id: z.string().optional().describe('Existing project id (from get_overview); omit to create'), name: z.string().max(80).optional(), client: z.string().max(80).optional(),
    contact: z.string().max(120).optional(), status: z.enum(['lead', 'proposal', 'active', 'delivered', 'paid', 'closed']).optional(), due: D.nullable().optional(),
    price: z.number().min(0).optional(), paid: z.number().min(0).optional().describe('Total received so far'), link: z.string().url().optional(), repo: z.string().url().optional(),
    stack: z.string().max(120).optional(), notes: z.string().max(2000).optional(),
  },
}, async i => {
  try { await connect(); } catch (e) { return fail(e.message); }
  const space = lists().find(l => l.space === 'freelance');
  if (!space) return fail('The Freelance space does not exist yet; open Doable once so it is created.');
  let p = i.id ? lists().find(l => l.id === i.id && l.project) : null;
  if (i.id && !p) return fail(`No project with id ${i.id}`);
  if (!p && !i.name) return fail('A new project needs a name');
  const colors = ['#7b68ee', '#e5484d', '#f76b15', '#e2a336', '#30a46c', '#12a594', '#0090ff', '#8e4ec6', '#d6409f'];
  const n = p ? { ...p } : { id: uid6(), name: i.name.trim(), color: colors[lists().length % colors.length], project: 'freelance', status: 'lead', createdAt: Date.now(), pos: lists().length };
  for (const k of ['name', 'client', 'contact', 'status', 'stack', 'notes']) if (i[k] != null) n[k] = String(i[k]).trim();
  if ('due' in i) { if (i.due) n.due = i.due; else delete n.due; }
  for (const k of ['price', 'paid']) if (i[k] != null) n[k] = Math.round(i[k]);
  for (const k of ['link', 'repo']) if (i[k]) n[k] = i[k];
  if (n.status === 'paid' && n.price && !n.paid) n.paid = n.price;
  n.updatedAt = Date.now();
  await write([{ id: 'list:' + n.id, kind: 'list', data: n }]);
  return text({ project: projectView(n) });
});

server.registerTool('list_issues', {
  title: 'List issues',
  description: 'Bugs, feature requests (RFEs) and chores on a project with their status. Call before update_issue (you need the id).',
  inputSchema: { project: z.string().describe('Project name or id'), status: z.enum(['open', 'closed', 'all']).optional().describe('Default open') },
}, async i => {
  try { await connect(); } catch (e) { return fail(e.message); }
  const p = findProject(i.project);
  if (!p) return fail(`No project called "${i.project}". Projects: ${projects().map(x => x.name).join(', ')}`);
  const all = issuesOf(p.id);
  const list = Issues.sort(all).filter(x => i.status === 'all' ? true : i.status === 'closed' ? !Issues.isOpen(x) : Issues.isOpen(x));
  return text({ project: p.name, summary: Issues.summary(all), issues: list.map(issueView) });
});

server.registerTool('report_issue', {
  title: 'Report an issue',
  description: 'File a bug, feature request (RFE) or chore on a freelance project.',
  inputSchema: {
    project: z.string().describe('Project name or id'), type: z.enum(['bug', 'feature', 'task']), title: z.string().min(1).max(200), details: z.string().max(8000).optional(),
    severity: z.enum(['critical', 'major', 'minor']).optional().describe('Bugs'), priority: z.enum(['high', 'normal', 'low']).optional().describe('Features and chores'),
    reporter: z.string().max(80).optional(), found_in: z.string().max(40).optional(), link: z.string().url().optional(),
  },
}, async i => {
  try { await connect(); } catch (e) { return fail(e.message); }
  const p = findProject(i.project);
  if (!p) return fail(`No project called "${i.project}". Projects: ${projects().map(x => x.name).join(', ')}`);
  const x = Issues.from({ id: uid6(), projectId: p.id, type: i.type, title: i.title, desc: i.details || '', severity: i.severity, priority: i.priority, reporter: i.reporter, version: i.found_in, link: i.link, createdAt: Date.now() });
  await write([{ id: 'issue:' + x.id, kind: 'issue', data: x }]);
  return text({ filed: issueView(x), project: p.name });
});

server.registerTool('update_issue', {
  title: 'Update an issue',
  description: 'Move an issue status (open, progress, fixed, verified, closed, wontfix), set the fix version, change fields, or delete it.',
  inputSchema: {
    id: z.string(), status: z.enum(['open', 'progress', 'fixed', 'verified', 'closed', 'wontfix']).optional(), note: z.string().max(500).optional().describe('Recorded in the history'),
    fixed_in: z.string().max(80).optional(), title: z.string().max(200).optional(), details: z.string().max(8000).optional(), severity: z.enum(['critical', 'major', 'minor']).optional(),
    priority: z.enum(['high', 'normal', 'low']).optional(), type: z.enum(['bug', 'feature', 'task']).optional(), delete: z.boolean().optional(),
  },
}, async i => {
  try { await connect(); } catch (e) { return fail(e.message); }
  const rec = records.get('issue:' + i.id);
  if (!rec) return fail(`No issue with id ${i.id}`);
  if (i.delete) { await write([{ id: 'issue:' + i.id, kind: 'issue', data: null }]); return text({ deleted: i.id }); }
  const patch = {};
  if (i.status) patch.status = i.status; if (i.note) patch.note = i.note; if (i.fixed_in) patch.fixVersion = i.fixed_in;
  if (i.title) patch.title = i.title; if (i.details != null) patch.desc = i.details; if (i.severity) patch.severity = i.severity; if (i.priority) patch.priority = i.priority; if (i.type) patch.type = i.type;
  const after = Issues.change(rec.data, patch, 'claude');
  await write([{ id: 'issue:' + after.id, kind: 'issue', data: after }]);
  return text({ updated: issueView(after) });
});

server.registerTool('track_time', {
  title: 'Track time',
  description: 'Start or stop the timer on a task, or log minutes already worked. One timer at a time; starting another stops it.',
  inputSchema: { action: z.enum(['start', 'stop', 'add']), task_id: z.string().optional().describe('For start/add; stop defaults to the running timer'), minutes: z.number().int().min(1).max(1440).optional(), note: z.string().max(120).optional() },
}, async i => {
  try { await connect(); } catch (e) { return fail(e.message); }
  const t = i.task_id ? getTask(i.task_id) : tasks().find(x => TimeLog.running(x));
  if (!t) return fail(i.task_id ? `No task with id ${i.task_id}` : 'No timer is running');
  const rows = [];
  let n;
  if (i.action === 'start') {
    const cur = tasks().find(x => TimeLog.running(x));
    if (cur && cur.id !== t.id) { const stopped = TimeLog.stop(cur); rows.push({ id: 'task:' + cur.id, kind: 'task', data: { ...stopped, updatedAt: Date.now() } }); }
    n = TimeLog.start(t); if (n.done) { n.done = false; n.status = 'todo'; n.doneAt = null; }
  } else if (i.action === 'stop') {
    if (!TimeLog.running(t)) return fail('That task has no running timer');
    n = TimeLog.stop(t, Date.now(), i.note);
  } else {
    if (!i.minutes) return fail('minutes is required for add');
    n = TimeLog.add(t, i.minutes, { note: i.note });
  }
  rows.push({ id: 'task:' + n.id, kind: 'task', data: { ...n, updatedAt: Date.now() } });
  await write(rows);
  return text({ task: view(n), total: TimeLog.fmt(TimeLog.ms(TimeLog.logsOf(n))) });
});

server.registerTool('log_habit', {
  title: 'Log a habit',
  description: 'Tick a habit (or set its count) for today or an earlier day.',
  inputSchema: { habit: z.string().describe('Habit name or id'), date: D.optional(), done: z.boolean().optional(), count: z.number().min(0).max(9999).optional() },
}, async i => {
  try { await connect(); } catch (e) { return fail(e.message); }
  const n = i.habit.toLowerCase();
  const p = practices().find(x => x.id === i.habit || x.name.toLowerCase() === n) || practices().find(x => x.name.toLowerCase().includes(n));
  if (!p) return fail(`No habit called "${i.habit}". Habits: ${practices().map(x => x.name).join(', ')}`);
  const d = i.date || todayStr();
  if (d > todayStr()) return fail('Habits can only be logged for today or earlier');
  const isCount = p.type === 'count';
  const count = isCount ? Math.round(i.count != null ? i.count : i.done === false ? 0 : p.target) : null;
  const done = isCount ? count >= p.target : i.done !== false;
  const id = `sadhana:${d}:${p.id}`;
  const clear = isCount ? !count : !done;
  await write([{ id, kind: 'sadhana', data: clear ? null : isCount ? { done, count, at: Date.now() } : { done: true, at: Date.now() } }]);
  return text({ habit: p.name, date: d, ...(isCount ? { count, target: p.target } : { done }) });
});

}
