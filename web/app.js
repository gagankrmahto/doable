/* Doable — a friendly task manager. Vanilla JS, no build step, works offline. */
(() => {
'use strict';

const { ymd, parseYmd, addDays, addMonths, startOfDay, nextWeekday } = window.DateUtil;
const STORAGE_KEY = 'doable:v1';
const LOCALE = navigator.language || 'en-US';
const MONTH_FIRST = (() => {
  try {
    const parts = new Intl.DateTimeFormat(LOCALE).formatToParts(new Date(2020, 11, 31));
    return parts.findIndex(p => p.type === 'month') < parts.findIndex(p => p.type === 'day');
  } catch { return true; }
})();
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => ymd(new Date());
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const trunc = (s, n = 40) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const normTag = s => s.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const initial = s => (String(s).trim().match(/[\p{L}\p{N}]/u) || ['•'])[0].toUpperCase();

/* ---------- Icons (Lucide-style strokes) ---------- */
const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  star: '<path d="M12 2.5l2.9 5.9 6.6 1-4.8 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.5 9.4l6.6-1z"/>',
  starFill: '<path fill="currentColor" d="M12 2.5l2.9 5.9 6.6 1-4.8 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.5 9.4l6.6-1z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  calendarDays: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  board: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  group: '<rect x="3" y="3" width="18" height="6" rx="1.5"/><rect x="3" y="13" width="18" height="8" rx="1.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  sort: '<path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  flagFill: '<path fill="currentColor" d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  tag: '<path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l8.59-8.59a1 1 0 0 0 0-1.41z"/><circle cx="7" cy="7" r="1.5"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  subtasks: '<path d="M21 12h-8M21 6H8M21 18h-8M3 6v4c0 1.1.9 2 2 2h3M3 10v6c0 1.1.9 2 2 2h3"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  keyboard: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
  status: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------- Constants ---------- */
const LIST_COLORS = ['#7b68ee', '#e5484d', '#f76b15', '#e2a336', '#30a46c', '#12a594', '#0090ff', '#8e4ec6', '#d6409f', '#6f6e77'];
const ACCENTS = ['#7b68ee', '#4f6bed', '#0090ff', '#12a594', '#30a46c', '#f76b15', '#e5484d', '#d6409f'];
const STATUSES = [
  { v: 'todo', label: 'To Do', color: '#87909e' },
  { v: 'progress', label: 'In Progress', color: '#5b6cf9' },
  { v: 'review', label: 'Review', color: '#f2a516' },
  { v: 'done', label: 'Complete', color: '#1db67f' },
];
const statusOf = v => STATUSES.find(s => s.v === v) || STATUSES[0];
const PRIORITIES = [
  { v: 1, label: 'Urgent', color: '#f04438' },
  { v: 2, label: 'High', color: '#f5a524' },
  { v: 3, label: 'Normal', color: '#5b8def' },
  { v: 4, label: 'Low', color: '#98a2b3' },
  { v: 0, label: 'None', color: '' },
];
const prioOf = p => PRIORITIES.find(x => x.v === p) || PRIORITIES[4];
const prioRank = p => (p === 0 ? 5 : p);
const SMART = [
  { id: 'today', name: 'Today', icon: 'sun' },
  { id: 'upcoming', name: 'Upcoming', icon: 'calendar' },
  { id: 'calendar', name: 'Calendar', icon: 'calendarDays' },
  { id: 'starred', name: 'Starred', icon: 'star' },
  { id: 'all', name: 'All tasks', icon: 'layers' },
  { id: 'completed', name: 'Completed', icon: 'checkCircle' },
];
const REMINDERS = [
  { v: '', label: 'No reminder' }, { v: 0, label: 'At time of task' }, { v: 5, label: '5 minutes before' },
  { v: 15, label: '15 minutes before' }, { v: 30, label: '30 minutes before' }, { v: 60, label: '1 hour before' },
  { v: 1440, label: '1 day before' },
];
const SORTS = [
  { v: 'manual', label: 'My order' }, { v: 'due', label: 'Due date' }, { v: 'priority', label: 'Priority' },
  { v: 'title', label: 'Title' }, { v: 'created', label: 'Recently added' },
];
const GROUPS = [
  { v: 'status', label: 'Status' }, { v: 'priority', label: 'Priority' }, { v: 'due', label: 'Due date' },
  { v: 'list', label: 'List' }, { v: 'none', label: 'None' },
];
const MODES = { list: { label: 'List', icon: 'list' }, board: { label: 'Board', icon: 'board' }, calendar: { label: 'Calendar', icon: 'calendarDays' } };
const QA_EXAMPLES = [
  'Call mom tomorrow 6pm #family',
  'Pay rent every month !1',
  'Standup every weekday 9:30am',
  'Dentist next friday at 3',
  'Buy milk tonight *',
];

/* ---------- State ---------- */
function newTask(o = {}) {
  return Object.assign({
    id: uid(), listId: null, parentId: null, title: '', notes: '', due: null, time: null, priority: 0,
    status: 'todo', starred: false, tags: [], repeat: null, remind: null, myDay: null, done: false, doneAt: null,
    createdAt: Date.now(), order: 0, collapsed: false, notifiedFor: null,
  }, o);
}

function defaultSettings() {
  return {
    theme: 'system', accent: '#7b68ee', weekStart: 1, newOnTop: true, sort: {}, group: {}, modes: {}, defaultListId: null, lastView: null, notifyAsked: false,
    calLayers: { festivals: true, aol: true, ngo: true }, calSpace: 'all', spacesInit: false,
  };
}

// The four life areas. Each is backed by a list; some also show a built-in event calendar.
const SPACES = [
  { id: 'personal', name: 'Personal', color: '#30a46c', aliases: ['personal'] },
  { id: 'work', name: 'Work', color: '#0090ff', aliases: ['work'] },
  { id: 'aol', name: 'Art of Living', color: '#f76b15', events: 'aol', aliases: ['art of living', 'aol'] },
  { id: 'ngo', name: 'NexJyoti NGO', color: '#12a594', events: 'ngo', aliases: ['nexjyoti ngo', 'nexjyoti', 'ngo'] },
];
const listFrom = l => {
  const out = { id: String(l.id), name: String(l.name || 'Untitled'), color: l.color || LIST_COLORS[0] };
  if (SPACES.some(s => s.id === l.space)) out.space = l.space;
  return out;
};
const spaceOf = list => list && SPACES.find(s => s.id === list.space);
const spaceList = spaceId => state.lists.find(l => l.space === spaceId);

// Make sure each space has a list (once per account; deterministic ids so devices don't create duplicates).
function ensureSpaces() {
  if (state.settings.spacesInit) return false;
  for (const sp of SPACES) {
    if (spaceList(sp.id)) continue;
    const byName = state.lists.find(l => !l.space && sp.aliases.includes(l.name.trim().toLowerCase()));
    if (byName) byName.space = sp.id;
    else if (!getList('space-' + sp.id)) state.lists.push({ id: 'space-' + sp.id, name: sp.name, color: sp.color, space: sp.id });
  }
  state.settings.spacesInit = true;
  return true;
}

function seedState() {
  const inbox = { id: uid(), name: 'My Tasks', color: LIST_COLORS[0] };
  const [personal, work, aol, ngo] = SPACES.map(s => ({ id: 'space-' + s.id, name: s.name, color: s.color, space: s.id }));
  const d = n => ymd(addDays(new Date(), n));
  const tasks = [];
  let order = 0;
  const add = (o, subs = []) => {
    const t = newTask({ ...o, order: order++ });
    if (t.done) t.status = 'done';
    tasks.push(t);
    subs.forEach((s, i) => tasks.push(newTask({ title: s, listId: t.listId, parentId: t.id, order: i, done: i === 0, status: i === 0 ? 'done' : 'todo', doneAt: i === 0 ? Date.now() : null })));
    return t;
  };
  add({ title: 'Welcome to Doable 👋 Click me to open details', listId: inbox.id, due: d(0), starred: true, status: 'progress',
    notes: 'Doable is your friendly task manager.\n\n• Click a task to see and edit everything about it\n• Click the status circle to complete it — or right-click for every action\n• Switch between List, Board and Calendar with the tabs above\n• Press ? anytime to see keyboard shortcuts' },
    ['Open this task', 'Tick off this subtask', 'Drag a card on the Board view']);
  add({ title: 'Try smart quick-add: type “Call mom tomorrow 6pm #family !2”', listId: inbox.id, due: d(0), priority: 3, tags: ['tips'] });
  add({ title: 'Group tasks by priority or due date with the Group button', listId: inbox.id, tags: ['tips'] });
  add({ title: 'Click a Due date or Priority cell to change it in place', listId: inbox.id, tags: ['tips'], status: 'review' });
  add({ title: 'Team standup', listId: work.id, due: d(0), time: '09:30', priority: 3, repeat: { freq: 'weekdays', interval: 1 } });
  add({ title: 'Reply to client emails', listId: work.id, due: d(-1), priority: 1, status: 'progress' });
  add({ title: 'Prepare quarterly report', listId: work.id, due: d(1), time: '10:00', priority: 2, tags: ['reports'], status: 'progress' },
    ['Collect numbers from finance', 'Draft summary slides', 'Review with manager']);
  add({ title: 'Design review with the team', listId: work.id, due: d(3), priority: 3, status: 'review' });
  add({ title: 'Water the plants', listId: personal.id, due: d(2), time: '18:00', priority: 4, repeat: { freq: 'weekly', interval: 1 } });
  add({ title: 'Plan weekend trip', listId: personal.id, due: d(4), tags: ['travel'] }, ['Book hotel', 'Check train times']);
  add({ title: 'Install Doable', listId: inbox.id, done: true, doneAt: Date.now() });
  const settings = defaultSettings();
  settings.defaultListId = inbox.id;
  settings.spacesInit = true;
  return { version: 2, lists: [inbox, personal, work, aol, ngo], tasks, settings, stats: { completions: { [todayStr()]: 1 } }, meta: { pristine: true } };
}

// fixOrphans: reassign tasks whose list is missing. Off while syncing, since a list can arrive after its tasks.
function normalize(data, { fixOrphans = false } = {}) {
  if (!data || !Array.isArray(data.lists) || !Array.isArray(data.tasks)) throw new Error('Invalid data');
  const ver = data.version || 1;
  const s = {
    version: 2,
    lists: data.lists.filter(l => l && l.id).map(listFrom),
    tasks: data.tasks.filter(t => t && t.id).map(t => {
      const n = newTask({ ...t, tags: Array.isArray(t.tags) ? t.tags : [] });
      if (ver < 2) n.priority = ({ 1: 1, 2: 2, 3: 4 })[t.priority] || 0; // v1 had High/Medium/Low
      if (!STATUSES.some(x => x.v === t.status)) n.status = n.done ? 'done' : 'todo';
      n.done = n.status === 'done';
      return n;
    }),
    settings: { ...defaultSettings(), ...(data.settings || {}) },
    stats: { completions: { ...((data.stats && data.stats.completions) || {}) } },
    meta: { pristine: !!(data.meta && data.meta.pristine) },
  };
  if (ver < 2 && s.settings.accent === '#4f6bed') s.settings.accent = '#7b68ee';
  if (!s.lists.length) s.lists.push({ id: uid(), name: 'My Tasks', color: LIST_COLORS[0] });
  const ids = new Set(s.lists.map(l => l.id));
  if (fixOrphans) s.tasks.forEach(t => { if (!ids.has(t.listId)) t.listId = s.lists[0].id; });
  if (!ids.has(s.settings.defaultListId)) s.settings.defaultListId = s.lists[0].id;
  ['sort', 'group', 'modes'].forEach(k => { if (typeof s.settings[k] !== 'object' || !s.settings[k]) s.settings[k] = {}; });
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.warn('Could not load saved data', e); }
  return seedState();
}

let state = load();
let saveFailed = false;
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); saveFailed = false; }
  catch (e) { if (!saveFailed) toast('Could not save — storage may be full or blocked'); saveFailed = true; }
  afterSave();
}
function afterSave() {
  if (window.DoableSync) DoableSync.changed();
  scheduleNativeReminders();
}
const touch = () => { state.meta.pristine = false; };

const ui = {
  view: { type: 'smart', id: 'today' },
  mode: 'list',
  search: '',
  selectedId: null,
  openId: null,
  addDue: null,
  calMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  calDay: todayStr(),
  showCompleted: {},
  collapsedGroups: {},
  inlineKey: null,
  addTargets: {},
  visibleIds: [],
  flashId: null,
  vm: null,
  menu: null,
  lastDay: todayStr(),
};
if (state.settings.lastView) {
  const [type, ...rest] = state.settings.lastView.split(':');
  const id = rest.join(':');
  if ((type === 'smart' && SMART.some(s => s.id === id)) || (type === 'list' && state.lists.some(l => l.id === id)) || type === 'tag') ui.view = { type, id };
}
ui.mode = state.settings.modes[`${ui.view.type}:${ui.view.id}`] || 'list';

/* ---------- Undo ---------- */
const undoStack = [];
function snapshot() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 60) undoStack.shift();
}
function undo() {
  const s = undoStack.pop();
  if (!s) { toast('Nothing to undo'); return; }
  state = JSON.parse(s);
  save();
  if (ui.openId && !getTask(ui.openId)) ui.openId = null;
  if (ui.view.type === 'list' && !getList(ui.view.id)) ui.view = { type: 'smart', id: 'today' };
  render();
  toast('Undone');
}
function commit(fn, opts = {}) {
  snapshot();
  fn();
  touch();
  save();
  render(opts);
  if (opts.toast) toast(opts.toast, { undo: true });
}

/* ---------- Getters & helpers ---------- */
const getTask = id => state.tasks.find(t => t.id === id);
const getList = id => state.lists.find(l => l.id === id);
const childrenOf = id => state.tasks.filter(t => t.parentId === id);
const defaultListId = () => (getList(state.settings.defaultListId) ? state.settings.defaultListId : state.lists[0].id);
const avatar = (name, color, cls = '') => `<span class="avatar ${cls}" style="--c:${color}">${esc(initial(name))}</span>`;
const statusPill = (s, cls = '') => `<span class="status-pill ${cls}" style="--sc:${statusOf(s).color}">${esc(statusOf(s).label)}</span>`;
const statusIco = (t, action = 'toggle') => `<button class="status-ico s-${t.status}" style="--sc:${statusOf(t.status).color}" data-action="${action}" role="checkbox" aria-checked="${t.done}" aria-label="${t.done ? 'Reopen' : 'Complete'}: ${esc(t.title)}" title="${esc(statusOf(t.status).label)} — click to ${t.done ? 'reopen' : 'complete'}">${icon('check')}</button>`;

function edgeOrder(listId, parentId, top) {
  const sib = state.tasks.filter(x => x.parentId === parentId && (parentId || x.listId === listId));
  if (!sib.length) return 0;
  const os = sib.map(x => x.order);
  return top ? Math.min(...os) - 1 : Math.max(...os) + 1;
}

function fmtDate(s, withWeekday = true) {
  const d = parseYmd(s);
  const T = startOfDay(new Date());
  const diff = Math.round((d - T) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString(LOCALE, { weekday: 'long' });
  const o = { month: 'short', day: 'numeric' };
  if (withWeekday) o.weekday = 'short';
  if (d.getFullYear() !== T.getFullYear()) o.year = 'numeric';
  return d.toLocaleDateString(LOCALE, o);
}
const fmtShort = s => parseYmd(s).toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' });
function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
}
const fmtDue = t => (t.due ? fmtDate(t.due) : '') + (t.time ? ` ${fmtTime(t.time)}` : '');
function dueClass(t) {
  if (!t.due || t.done) return '';
  const T = todayStr();
  if (t.due < T) return 'overdue';
  if (t.due === T) {
    if (t.time) {
      const n = new Date();
      if (t.time < `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`) return 'overdue';
    }
    return 'today';
  }
  if (t.due === ymd(addDays(new Date(), 1))) return 'soon';
  return '';
}
function repeatLabel(r) {
  if (!r) return '';
  if (r.freq === 'weekdays') return 'Every weekday';
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.freq];
  if (r.interval === 1) return { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }[r.freq];
  return `Every ${r.interval} ${unit}s`;
}
function nextDue(t) {
  const T = startOfDay(new Date());
  let d = t.due ? parseYmd(t.due) : T;
  const step = x => {
    const n = t.repeat.interval || 1;
    switch (t.repeat.freq) {
      case 'daily': return addDays(x, n);
      case 'weekdays': { let y = addDays(x, 1); while (y.getDay() === 0 || y.getDay() === 6) y = addDays(y, 1); return y; }
      case 'weekly': return addDays(x, 7 * n);
      case 'monthly': return addMonths(x, n);
      case 'yearly': return addMonths(x, 12 * n);
      default: return addDays(x, 1);
    }
  };
  d = step(d);
  let guard = 0;
  while (d <= T && guard++ < 1000) d = step(d);
  return ymd(d);
}

/* ---------- Mutations ---------- */
function bumpStat(delta) {
  const k = todayStr();
  state.stats.completions[k] = Math.max(0, (state.stats.completions[k] || 0) + delta);
}

function toggleComplete(id) {
  const t = getTask(id);
  if (!t) return;
  const T = todayStr();
  const wasDone = t.done;
  let msg = null;
  const todayActiveBefore = activeTodayCount();
  commit(() => {
    if (!wasDone) {
      t.done = true;
      t.status = 'done';
      t.doneAt = Date.now();
      bumpStat(1);
      if (t.repeat && !t.parentId) {
        const next = newTask({ ...t, id: uid(), done: false, status: 'todo', doneAt: null, createdAt: Date.now(), due: nextDue(t), notifiedFor: null, myDay: null });
        state.tasks.push(next);
        childrenOf(t.id).forEach(k => state.tasks.push(newTask({ ...k, id: uid(), parentId: next.id, done: false, status: 'todo', doneAt: null, createdAt: Date.now() })));
        msg = `Done! Next one: ${fmtDate(next.due)}`;
      } else {
        msg = t.parentId ? 'Subtask completed' : 'Task completed';
      }
    } else {
      t.done = false;
      t.status = 'todo';
      t.doneAt = null;
      bumpStat(-1);
    }
  });
  if (msg) toast(msg, { undo: true });
  if (!wasDone && !t.parentId && todayActiveBefore > 0 && activeTodayCount() === 0 && ((t.due && t.due <= T) || t.myDay === T)) {
    celebrate();
    toast('🎉 All done for today — great work!');
  }
}
function activeTodayCount() {
  const T = todayStr();
  return state.tasks.filter(t => !t.parentId && !t.done && ((t.due && t.due <= T) || t.myDay === T)).length;
}

function setStatus(id, s, quiet) {
  const t = getTask(id);
  if (!t || t.status === s) return;
  if (s === 'done') { completeWithAnim(id); return; }
  commit(() => {
    if (t.done) { t.done = false; t.doneAt = null; bumpStat(-1); }
    t.status = s;
  }, { toast: quiet ? null : `Moved to ${statusOf(s).label}` });
}
function shiftStatus(id, dir) {
  const t = getTask(id);
  if (!t) return;
  const i = STATUSES.findIndex(s => s.v === t.status);
  const n = STATUSES[clamp(i + dir, 0, STATUSES.length - 1)];
  if (n.v !== t.status) setStatus(id, n.v);
}

function completeWithAnim(id) {
  const t = getTask(id);
  const row = $(`#content [data-task][data-id="${id}"], #content .cal-task[data-id="${id}"]`);
  if (!t || t.done || !row || REDUCED_MOTION) { toggleComplete(id); return; }
  if (row.classList.contains('completing')) return;
  row.classList.add('completing');
  setTimeout(() => toggleComplete(id), 320);
}

function toggleStar(id) {
  const t = getTask(id);
  if (t) commit(() => { t.starred = !t.starred; });
}

function deleteTask(id) {
  const t = getTask(id);
  if (!t) return;
  const ids = new Set([id, ...childrenOf(id).map(k => k.id)]);
  commit(() => {
    state.tasks = state.tasks.filter(x => !ids.has(x.id));
    if (ids.has(ui.openId)) ui.openId = t.parentId && getTask(t.parentId) ? t.parentId : null;
    if (ids.has(ui.selectedId)) ui.selectedId = null;
  }, { toast: `Deleted “${trunc(t.title || 'Untitled', 32)}”` });
}

function duplicateTask(id) {
  const t = getTask(id);
  if (!t) return;
  const copy = newTask({ ...t, id: uid(), createdAt: Date.now(), done: false, status: t.status === 'done' ? 'todo' : t.status, doneAt: null, order: t.order + 0.5, notifiedFor: null });
  commit(() => {
    state.tasks.push(copy);
    childrenOf(t.id).forEach(k => state.tasks.push(newTask({ ...k, id: uid(), parentId: copy.id, createdAt: Date.now() })));
    renumber(t.listId, t.parentId);
    ui.flashId = copy.id;
  }, { toast: 'Task duplicated' });
}

function renumber(listId, parentId) {
  state.tasks.filter(x => x.parentId === parentId && (parentId || x.listId === listId))
    .sort((a, b) => a.order - b.order).forEach((x, i) => { x.order = i; });
}

function setListOf(t, listId) {
  t.listId = listId;
  childrenOf(t.id).forEach(k => { k.listId = listId; });
}
function moveToList(id, listId) {
  const t = getTask(id);
  if (!t) return;
  const list = getList(listId);
  if (t.listId === listId && !t.parentId) return;
  commit(() => {
    t.parentId = null;
    setListOf(t, listId);
    t.order = edgeOrder(listId, null, state.settings.newOnTop);
  }, { toast: `Moved to ${list.name}` });
}

function setDue(id, due) {
  const t = getTask(id);
  if (!t) return;
  commit(() => {
    t.due = due;
    if (!due) { t.time = null; t.remind = null; t.repeat = null; }
    t.notifiedFor = null;
  }, { toast: due ? `Due ${fmtDate(due)}` : 'Date removed' });
}
const nextWeekStr = () => ymd(nextWeekday(startOfDay(new Date()), 1, false));

function setPriority(id, p) {
  const t = getTask(id);
  if (t && t.priority !== p) commit(() => { t.priority = p; });
}

function addTaskFromText(text, extra = {}) {
  const p = QuickParse.parse(text, { lists: state.lists, monthFirst: MONTH_FIRST });
  const d = { ...quickAddDefaults(), ...extra };
  const listId = p.listId || d.listId;
  const task = newTask({
    title: p.title,
    listId,
    due: p.due || d.due || null,
    time: p.time,
    priority: p.priority || d.priority || 0,
    status: d.status && d.status !== 'done' ? d.status : 'todo',
    starred: p.starred || !!d.starred,
    tags: [...new Set([...(d.tags || []), ...p.tags])],
    repeat: p.repeat,
    order: edgeOrder(listId, null, state.settings.newOnTop),
  });
  commit(() => { state.tasks.push(task); ui.flashId = task.id; });
  if (!ui.visibleIds.includes(task.id)) {
    const where = [getList(listId).name, task.due && fmtDate(task.due)].filter(Boolean).join(' · ');
    toast(`Added to ${where}`, { action: { label: 'Open', fn: () => openDetails(task.id) } });
  }
}

function quickAddDefaults() {
  const v = ui.view;
  const d = { listId: defaultListId() };
  if (ui.search) return d;
  if (v.type === 'list' && getList(v.id)) d.listId = v.id;
  if (v.type === 'tag') d.tags = [v.id];
  if (v.type === 'smart' && v.id === 'today') d.due = todayStr();
  if (v.type === 'smart' && v.id === 'starred') d.starred = true;
  if (v.type === 'smart' && v.id === 'calendar' && state.settings.calSpace !== 'all') {
    const l = spaceList(state.settings.calSpace);
    if (l) d.listId = l.id;
  }
  if (ui.mode === 'calendar' && ui.vm && ui.vm.modes.includes('calendar')) d.due = ui.calDay;
  if (ui.addDue) d.due = ui.addDue;
  return d;
}

function addSubtask(parent, title) {
  commit(() => {
    state.tasks.push(newTask({ title, listId: parent.listId, parentId: parent.id, order: edgeOrder(parent.listId, parent.id, false) }));
    parent.collapsed = false;
  });
}

function reorder(dragId, targetId, after) {
  const D = getTask(dragId), T = getTask(targetId);
  if (!D || !T || D.id === T.id || T.parentId === D.id) return;
  const newParent = T.parentId;
  if (newParent && childrenOf(D.id).length) { toast('A task with subtasks can’t become a subtask'); return; }
  commit(() => {
    D.parentId = newParent;
    if (D.listId !== T.listId) setListOf(D, T.listId);
    if (!newParent && groupMode() === 'status' && !T.done && D.status !== T.status) {
      if (D.done) { D.done = false; D.doneAt = null; bumpStat(-1); }
      D.status = T.status;
    }
    const sibs = state.tasks
      .filter(x => x.id !== D.id && x.parentId === newParent && (newParent || x.listId === T.listId))
      .sort((a, b) => a.order - b.order);
    sibs.splice(sibs.findIndex(x => x.id === T.id) + (after ? 1 : 0), 0, D);
    sibs.forEach((x, i) => { x.order = i; });
  });
}

function indent(id) {
  const t = getTask(id);
  if (!t || t.parentId || !canReorder()) return;
  if (childrenOf(t.id).length) { toast('A task with subtasks can’t become a subtask'); return; }
  const group = (ui.vm.groups || []).find(g => g.tasks.some(x => x.id === id));
  const idx = group ? group.tasks.findIndex(x => x.id === id) : -1;
  if (idx <= 0) return;
  const parent = group.tasks[idx - 1];
  commit(() => {
    t.parentId = parent.id;
    t.order = edgeOrder(parent.listId, parent.id, false);
    parent.collapsed = false;
  });
}
function outdent(id) {
  const t = getTask(id);
  if (!t || !t.parentId) return;
  const parent = getTask(t.parentId);
  commit(() => {
    t.parentId = null;
    t.status = parent.status === 'done' ? 'todo' : parent.status;
    if (t.done) t.status = 'done';
    const sibs = state.tasks.filter(x => !x.parentId && x.listId === t.listId && x.id !== t.id).sort((a, b) => a.order - b.order);
    sibs.splice(sibs.findIndex(x => x.id === parent.id) + 1, 0, t);
    sibs.forEach((x, i) => { x.order = i; });
  });
}

/* ---------- View model ---------- */
const viewKey = () => `${ui.view.type}:${ui.view.id}`;
function sortMode() {
  const s = state.settings.sort[viewKey()];
  if (s) return s;
  if (ui.view.type === 'list' || ui.view.type === 'tag' || ui.view.id === 'starred') return 'manual';
  return 'due';
}
function groupMode() {
  return state.settings.group[viewKey()] || (ui.view.id === 'all' ? 'list' : 'status');
}
function sortTasks(tasks, mode) {
  const arr = [...tasks];
  const byOrder = (a, b) => a.order - b.order;
  const dueKey = t => (t.due ? `${t.due} ${t.time || '99:99'}` : '9999');
  switch (mode) {
    case 'due': return arr.sort((a, b) => dueKey(a).localeCompare(dueKey(b)) || prioRank(a.priority) - prioRank(b.priority) || byOrder(a, b));
    case 'priority': return arr.sort((a, b) => prioRank(a.priority) - prioRank(b.priority) || dueKey(a).localeCompare(dueKey(b)) || byOrder(a, b));
    case 'title': return arr.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }));
    case 'created': return arr.sort((a, b) => b.createdAt - a.createdAt);
    default: return arr.sort(byOrder);
  }
}
const byDoneDesc = arr => [...arr].sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
const canReorder = () => ui.view.type === 'list' && !ui.search && sortMode() === 'manual' && ui.mode === 'list' && ['status', 'none'].includes(groupMode());

function groupTasks(items, mode) {
  const active = items.filter(t => !t.done);
  const S = arr => sortTasks(arr, sortMode());
  const T = todayStr();
  switch (mode) {
    case 'status':
      return STATUSES.filter(s => s.v !== 'done').map(s => ({
        key: 's:' + s.v, title: s.label, pill: s.color, tasks: S(active.filter(t => t.status === s.v)), add: { status: s.v }, keepEmpty: s.v === 'todo',
      }));
    case 'priority':
      return PRIORITIES.map(p => ({ key: 'p:' + p.v, title: p.v ? p.label : 'No priority', flag: p.color || 'var(--text-3)', tasks: S(active.filter(t => t.priority === p.v)), add: { priority: p.v } }));
    case 'due': {
      const tm = ymd(addDays(new Date(), 1));
      const wk = ymd(addDays(new Date(), 7));
      const b = [
        { key: 'd:overdue', title: 'Overdue', tone: 'danger', f: t => t.due && t.due < T },
        { key: 'd:today', title: 'Today', f: t => t.due === T, add: { due: T } },
        { key: 'd:tomorrow', title: 'Tomorrow', f: t => t.due === tm, add: { due: tm } },
        { key: 'd:week', title: 'Next 7 days', f: t => t.due > tm && t.due <= wk },
        { key: 'd:later', title: 'Later', f: t => t.due > wk },
        { key: 'd:none', title: 'No date', f: t => !t.due, add: { due: null } },
      ];
      return b.map(g => ({ key: g.key, title: g.title, tone: g.tone, add: g.add, tasks: sortTasks(active.filter(g.f), sortMode() === 'manual' ? 'due' : sortMode()) }));
    }
    case 'list':
      return state.lists.map(l => ({ key: 'l:' + l.id, title: l.name, color: l.color, nav: `list:${l.id}`, tasks: S(active.filter(t => t.listId === l.id)), add: { listId: l.id } }));
    default:
      return [{ key: 'all', title: 'Tasks', tasks: S(active), add: {}, keepEmpty: true }];
  }
}

function viewModel() {
  const v = ui.view;
  const T = todayStr();
  const top = state.tasks.filter(t => !t.parentId);
  const S = arr => sortTasks(arr, sortMode());
  const ALL_MODES = ['list', 'board', 'calendar'];

  if (ui.search) {
    const q = ui.search.toLowerCase();
    const res = state.tasks.filter(t => `${t.title} ${t.notes} ${t.tags.map(x => '#' + x).join(' ')}`.toLowerCase().includes(q));
    return {
      title: 'Search', icon: 'search', flat: true, showList: true, modes: ['list'],
      subtitle: `${plural(res.length, 'result')} for “${ui.search}”`,
      groups: [{ key: 'results', title: 'Results', tasks: S(res.filter(t => !t.done)) }],
      completed: byDoneDesc(res.filter(t => t.done)),
      empty: { icon: 'search', title: 'No matches', text: 'Try a different word, or a #tag.' },
    };
  }

  if (v.type === 'list') {
    const list = getList(v.id);
    const items = top.filter(t => t.listId === v.id);
    const done = items.filter(t => t.done);
    const active = items.length - done.length;
    return {
      title: list.name, color: list.color, list, section: list.space ? 'Spaces' : 'Lists', groupable: true, modes: ALL_MODES,
      comingUp: upcomingSpaceEvents(list),
      subtitle: active ? `${plural(active, 'task')} to do` : 'All caught up',
      groups: groupTasks(items, groupMode()), completed: byDoneDesc(done), calTasks: items, boardTasks: items,
      progress: items.length ? { done: done.length, total: items.length } : null,
      empty: { icon: 'sparkles', title: 'This list is empty', text: 'Add your first task — try typing a date like “tomorrow”.' },
    };
  }

  if (v.type === 'tag') {
    const items = state.tasks.filter(t => t.tags.includes(v.id));
    return {
      title: `#${v.id}`, icon: 'hash', section: 'Tags', flat: true, showList: true, groupable: true, modes: ALL_MODES,
      subtitle: plural(items.filter(t => !t.done).length, 'open task'),
      groups: groupTasks(items, groupMode()), completed: byDoneDesc(items.filter(t => t.done)), calTasks: items, boardTasks: items,
      empty: { icon: 'hash', title: `Nothing tagged #${v.id}`, text: 'Add tags by typing #something in a task.' },
    };
  }

  switch (v.id) {
    case 'today': {
      const items = top.filter(t => (t.due && t.due <= T) || t.myDay === T);
      const active = items.filter(t => !t.done);
      const overdue = active.filter(t => t.due && t.due < T);
      const rest = active.filter(t => !(t.due && t.due < T));
      const completed = byDoneDesc(top.filter(t => t.done && t.doneAt && ymd(new Date(t.doneAt)) === T));
      const groups = [];
      if (overdue.length) groups.push({ key: 'overdue', title: 'Overdue', tone: 'danger', tasks: S(overdue), action: { label: 'Move all to today', name: 'reschedule-overdue' } });
      groups.push({ key: 'today', title: 'Today', tasks: S(rest), add: { due: T }, keepEmpty: true });
      const total = active.length + completed.length;
      return {
        title: 'Today', icon: 'sun', showList: true, groups, completed, modes: ['list', 'board', 'calendar'], boardTasks: [...active, ...completed],
        calTasks: top.filter(t => t.due), banner: eventsByDate(T, T)[T],
        subtitle: new Date().toLocaleDateString(LOCALE, { weekday: 'long', month: 'long', day: 'numeric' }),
        progress: total ? { done: completed.length, total } : null,
        empty: completed.length
          ? { icon: 'sparkles', title: 'You’re all done for today 🎉', text: 'Enjoy the rest of your day — or plan ahead in Upcoming.' }
          : { icon: 'sun', title: 'Nothing planned for today', text: 'Add a task, or pull something in from Upcoming.' },
      };
    }
    case 'upcoming': {
      const active = top.filter(t => !t.done && t.due);
      const groups = [];
      const overdue = active.filter(t => t.due < T);
      if (overdue.length) groups.push({ key: 'overdue', title: 'Overdue', tone: 'danger', tasks: S(overdue), action: { label: 'Move all to today', name: 'reschedule-overdue' } });
      const days = new Set();
      for (let i = 0; i < 7; i++) days.add(ymd(addDays(new Date(), i)));
      active.filter(t => t.due >= T).forEach(t => days.add(t.due));
      const evs = eventsByDate(T, ymd(addDays(new Date(), 6)));
      [...days].sort().forEach(ds => {
        groups.push({ key: ds, title: fmtDate(ds), hint: fmtShort(ds), tasks: S(active.filter(t => t.due === ds)), add: { due: ds }, keepEmpty: true, compact: true, events: evs[ds] });
      });
      return {
        title: 'Upcoming', icon: 'calendar', showList: true, groups, completed: [], modes: ALL_MODES,
        calTasks: top.filter(t => t.due), boardTasks: top.filter(t => t.due && (!t.done || ymd(new Date(t.doneAt || 0)) === T)),
        subtitle: 'Plan your week ahead', hideEmpty: true,
      };
    }
    case 'calendar': {
      const sp = state.settings.calSpace && state.settings.calSpace !== 'all' ? spaceList(state.settings.calSpace) : null;
      const items = sp ? top.filter(t => t.listId === sp.id) : top;
      return {
        title: sp ? `${sp.name} calendar` : 'Calendar', icon: 'calendarDays', showList: !sp, modes: ['calendar'], groups: [], completed: [],
        calTasks: items, subtitle: `${plural(items.filter(t => t.due && !t.done).length, 'scheduled task')} · tap a day to see its events`,
      };
    }
    case 'starred': {
      const items = top.filter(t => t.starred);
      return {
        title: 'Starred', icon: 'star', showList: true, groupable: true, modes: ALL_MODES,
        subtitle: 'Your most important tasks',
        groups: groupTasks(items, groupMode()), completed: byDoneDesc(items.filter(t => t.done)), calTasks: items, boardTasks: items,
        empty: { icon: 'star', title: 'No starred tasks', text: 'Click the ☆ on any task to keep it here.' },
      };
    }
    case 'all': {
      const active = top.filter(t => !t.done);
      return {
        title: 'All tasks', icon: 'layers', showList: true, groupable: true, modes: ALL_MODES,
        subtitle: `${plural(active.length, 'open task')} across ${plural(state.lists.length, 'list')}`,
        groups: groupTasks(top, groupMode()), completed: byDoneDesc(top.filter(t => t.done)), calTasks: top, boardTasks: top,
        empty: { icon: 'sparkles', title: 'No open tasks', text: 'A clean slate. Add something above.' },
      };
    }
    case 'completed': {
      const done = byDoneDesc(top.filter(t => t.done));
      const map = new Map();
      done.forEach(t => {
        const k = t.doneAt ? ymd(new Date(t.doneAt)) : 'earlier';
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(t);
      });
      const groups = [...map].map(([k, tasks]) => ({ key: k, title: k === 'earlier' ? 'Earlier' : fmtDate(k), tasks }));
      return {
        title: 'Completed', icon: 'checkCircle', showList: true, groups, completed: [], sortable: false, modes: ['list'],
        subtitle: `${plural(done.length, 'task')} completed`,
        empty: { icon: 'checkCircle', title: 'Nothing completed yet', text: 'Finished tasks show up here, grouped by day.' },
      };
    }
  }
  ui.view = { type: 'smart', id: 'today' };
  return viewModel();
}

/* ---------- Rendering ---------- */
function render(opts = {}) {
  if (ui.view.type === 'list' && !getList(ui.view.id)) ui.view = { type: 'smart', id: 'today' };
  renderSidebar();
  renderMain();
  if (!opts.keepDetails) renderDetails();
}

let mainRaf = 0;
function scheduleMainRender() {
  cancelAnimationFrame(mainRaf);
  mainRaf = requestAnimationFrame(() => { renderSidebar(); renderMain(); });
}

function renderSidebar() {
  const T = todayStr();
  const active = state.tasks.filter(t => !t.parentId && !t.done);
  const weekEnd = ymd(addDays(new Date(), 7));
  const overdue = active.filter(t => t.due && t.due < T).length;
  const counts = {
    today: active.filter(t => (t.due && t.due <= T) || t.myDay === T).length,
    upcoming: active.filter(t => t.due && t.due > T && t.due <= weekEnd).length,
    starred: active.filter(t => t.starred).length,
    all: active.length,
  };
  const cur = ui.search ? '' : viewKey();
  $('#smartNav').innerHTML = SMART.map(s => `
    <div class="nav-row">
      <button class="nav-item ${cur === 'smart:' + s.id ? 'active' : ''}" data-nav="smart:${s.id}" data-drop-smart="${s.id}">
        ${icon(s.icon)}<span class="nav-label">${s.name}</span>
        ${counts[s.id] ? `<span class="count ${s.id === 'today' && overdue ? 'danger' : ''}" title="${s.id === 'today' && overdue ? overdue + ' overdue' : ''}">${counts[s.id]}</span>` : ''}
      </button>
    </div>`).join('');

  const listRow = l => {
    const n = active.filter(t => t.listId === l.id).length;
    const sp = spaceOf(l);
    const set = sp && sp.events && EVENT_SETS[sp.events];
    return `
    <div class="nav-row">
      <button class="nav-item ${cur === 'list:' + l.id ? 'active' : ''}" data-nav="list:${l.id}" data-drop-list="${l.id}">
        ${avatar(l.name, l.color, 'sm')}<span class="nav-label">${esc(l.name)}</span>
        ${set ? `<span class="nav-emoji" title="Includes ${esc(set.name)} calendar">${set.emoji}</span>` : ''}
        ${n ? `<span class="count">${n}</span>` : ''}
      </button>
      <button class="nav-edit icon-btn xs" data-action="edit-list" data-list="${l.id}" aria-label="Edit ${esc(l.name)}" title="List settings">${icon('more')}</button>
    </div>`;
  };
  const spaceLists = SPACES.map(s => spaceList(s.id)).filter(Boolean);
  $('#spaceSection').hidden = !spaceLists.length;
  $('#spaceNav').innerHTML = spaceLists.map(listRow).join('');
  $('#listNav').innerHTML = state.lists.filter(l => !spaceOf(l)).map(listRow).join('');

  const tagCounts = {};
  state.tasks.filter(t => !t.done).forEach(t => t.tags.forEach(g => { tagCounts[g] = (tagCounts[g] || 0) + 1; }));
  const tags = Object.keys(tagCounts).sort();
  $('#tagSection').hidden = !tags.length;
  $('#tagNav').innerHTML = tags.map(g => `
    <div class="nav-row">
      <button class="nav-item ${cur === 'tag:' + g ? 'active' : ''}" data-nav="tag:${esc(g)}">
        ${icon('hash')}<span class="nav-label">${esc(g)}</span><span class="count">${tagCounts[g]}</span>
      </button>
    </div>`).join('');

  const doneToday = state.stats.completions[T] || 0;
  const streak = getStreak();
  $('#sidebarFoot').innerHTML = `
    ${syncPill()}
    <div class="foot-row">
      <div class="stats" title="Tasks completed today · days in a row with at least one completed task">
        <span class="stat">${icon('checkCircle')}<b>${doneToday}</b>&nbsp;done today</span>
        ${streak > 1 ? `<span class="stat streak">${icon('flame')}<b>${streak}</b>-day streak</span>` : ''}
      </div>
      <div class="foot-actions">
        <button class="icon-btn sm" data-action="theme" title="Toggle dark mode" aria-label="Toggle dark mode">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
        <button class="icon-btn sm" data-action="shortcuts" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">${icon('keyboard')}</button>
        <button class="icon-btn sm" data-action="settings" title="Settings" aria-label="Settings">${icon('settings')}</button>
      </div>
    </div>`;
}

function getStreak() {
  const c = state.stats.completions;
  let d = new Date();
  if (!c[ymd(d)]) d = addDays(d, -1);
  let n = 0;
  while (c[ymd(d)] > 0 && n < 3650) { n++; d = addDays(d, -1); }
  return n;
}

function renderMain() {
  const vm = viewModel();
  ui.vm = vm;
  if (!vm.modes.includes(ui.mode)) ui.mode = vm.modes[0];
  ui.addTargets = {};
  renderHeader(vm);
  renderQaHint();
  const content = $('#content');
  content.dataset.mode = ui.mode;
  content.innerHTML = ui.mode === 'calendar' ? renderCalendar(vm) : ui.mode === 'board' ? renderBoard(vm) : renderList(vm);
  ui.visibleIds = $$('#content [data-task]').map(el => el.dataset.id);
  if (ui.inlineKey) {
    const inp = $('#content .inline-input');
    if (inp) inp.focus({ preventScroll: true }); else ui.inlineKey = null;
  }
  if (ui.flashId) {
    const el = $(`#content [data-id="${ui.flashId}"]`);
    if (el) { el.classList.add('flash'); el.scrollIntoView({ block: 'nearest' }); }
    ui.flashId = null;
  }
  document.title = `${vm.title} · Doable`;
}

function renderHeader(vm) {
  const pct = vm.progress ? Math.round((vm.progress.done / vm.progress.total) * 100) : 0;
  const closedOpen = ui.showCompleted[viewKey()] ?? (ui.view.id === 'today');
  $('#topbar').innerHTML = `
    <div class="crumbbar">
      <button class="icon-btn only-mobile" data-action="toggle-sidebar" aria-label="Open menu">${icon('menu')}</button>
      <div class="crumbs">
        <span class="crumb-root">${icon(vm.list ? 'folder' : vm.section === 'Tags' ? 'tag' : 'home')}<span>${esc(vm.section || 'Workspace')}</span></span>
        ${icon('chevronRight', 'crumb-sep')}
        <h1 class="crumb-cur">${vm.color ? avatar(vm.title, vm.color, 'md') : vm.icon ? `<span class="title-icon">${icon(vm.icon)}</span>` : ''}<span class="title-text">${esc(vm.title)}</span></h1>
        ${vm.list ? `<button class="icon-btn xs" data-action="edit-list" data-list="${vm.list.id}" title="List settings" aria-label="List settings">${icon('more')}</button>` : ''}
      </div>
      ${vm.subtitle ? `<span class="crumb-sub">${esc(vm.subtitle)}</span>` : ''}
      <span class="spacer"></span>
      ${vm.progress ? `<div class="mini-progress" title="${vm.progress.done} of ${vm.progress.total} done"><div class="bar"><span style="width:${pct}%"></span></div><b>${pct}%</b></div>` : ''}
      <button class="icon-btn sm" data-action="view-menu" title="More options" aria-label="More options">${icon('more')}</button>
    </div>
    <div class="viewbar">
      <div class="vtabs" role="tablist" aria-label="Views">
        ${vm.modes.map(m => `<button role="tab" class="vtab ${ui.mode === m ? 'on' : ''}" aria-selected="${ui.mode === m}" data-action="mode" data-mode="${m}" title="${MODES[m].label} view (V)">${icon(MODES[m].icon)}<span>${MODES[m].label}</span></button>`).join('')}
      </div>
      <span class="spacer"></span>
      <div class="tools">
        ${vm.groupable && ui.mode === 'list' ? `<button class="tool-btn" data-action="group" title="Group by">${icon('group')}<span>Group: ${GROUPS.find(g => g.v === groupMode()).label}</span></button>` : ''}
        ${ui.mode !== 'calendar' && vm.sortable !== false ? `<button class="tool-btn" data-action="sort" title="Sort">${icon('sort')}<span>${SORTS.find(s => s.v === sortMode()).label}</span></button>` : ''}
        ${ui.mode === 'list' && vm.completed && vm.completed.length ? `<button class="tool-btn ${closedOpen ? 'on' : ''}" data-action="toggle-completed" aria-pressed="${closedOpen}" title="Show completed tasks">${icon('checkCircle')}<span>Closed</span></button>` : ''}
        <button class="btn primary sm" data-action="new-task" title="New task (N)">${icon('plus')}<span>Task</span></button>
      </div>
    </div>`;
}

function renderQaHint() {
  const input = $('#qaInput');
  const d = quickAddDefaults();
  const list = getList(d.listId);
  const bits = [];
  if (ui.view.type === 'list' && list) bits.push(`to ${list.name}`);
  if (d.due) bits.push(fmtDate(d.due) === 'Today' ? 'for today' : `on ${fmtDate(d.due)}`);
  input.placeholder = `Add a task${bits.length ? ' ' + bits.join(' ') : ''} — just type naturally`;
  renderQaPreview();
}

function inlineAdd(key, defaults, variant = 'row') {
  ui.addTargets[key] = defaults;
  const st = defaults.status || 'todo';
  if (ui.inlineKey === key) {
    return `<div class="inline-add ${variant} editing">
      <span class="status-ico s-${st}" style="--sc:${statusOf(st).color}"></span>
      <input class="inline-input" data-inline="${esc(key)}" placeholder="Task name — try “fri !2 #idea”" autocomplete="off" aria-label="New task name">
      <kbd>Enter</kbd>
    </div>`;
  }
  return `<button class="inline-add ${variant}" data-action="inline-add" data-g="${esc(key)}">${icon('plus')}<span>Add Task</span></button>`;
}

function groupHead(g, vm, collapsed, extraCls = '') {
  let label;
  if (g.pill) label = `<span class="status-pill solid" style="--sc:${g.pill}">${esc(g.title)}</span>`;
  else if (g.flag) label = `<span class="gh-flag" style="color:${g.flag}">${icon('flagFill')}</span><h2>${esc(g.title)}</h2>`;
  else if (g.color) label = `${avatar(g.title, g.color, 'xs')}<h2>${g.nav ? `<button class="link" data-nav="${g.nav}">${esc(g.title)}</button>` : esc(g.title)}</h2>`;
  else label = `<h2>${esc(g.title)}</h2>`;
  return `<header class="group-head ${extraCls}">
    <div class="gh-main">
      <button class="gh-caret" data-action="group-toggle" data-g="${esc(g.key)}" aria-expanded="${!collapsed}" aria-label="${collapsed ? 'Expand' : 'Collapse'} group">${icon('chevronRight', collapsed ? '' : 'rot')}</button>
      ${label}
      ${g.hint && g.hint !== g.title ? `<span class="group-hint">${esc(g.hint)}</span>` : ''}
      ${g.events && g.events.length ? `<span class="gh-events">${g.events.map(evPill).join('')}</span>` : ''}
      <span class="group-count">${g.tasks.length}</span>
      ${g.add ? `<button class="icon-btn xs gh-add" data-action="inline-add" data-g="${esc(g.key)}" title="Add task" aria-label="Add task to ${esc(g.title)}">${icon('plus')}</button>` : ''}
      ${g.action ? `<button class="link-btn" data-action="${g.action.name}">${esc(g.action.label)}</button>` : ''}
    </div>
    ${!collapsed && g.tasks.length ? `<div class="col-label">Due date</div><div class="col-label">Priority</div><div class="col-label">${vm.showList ? 'List' : 'Status'}</div>` : ''}
  </header>`;
}

// Next few events from a space's own calendar (e.g. Art of Living), shown at the top of that list.
function upcomingSpaceEvents(list) {
  const sp = spaceOf(list);
  if (!sp || !sp.events || !layerOn(sp.events)) return null;
  const T = todayStr();
  const map = eventsByDate(T, ymd(addDays(new Date(), 60)), [sp.events]);
  const evs = Object.keys(map).sort().flatMap(d => map[d]).slice(0, 4);
  return evs.length ? evs : null;
}

function eventStrip(title, evs, withDates) {
  return `<section class="event-strip">
    <header>${esc(title)}</header>
    <div class="es-items">${evs.map(e => `<button class="es-item" data-action="goto-event" data-ev="${e.id}" style="--ec:${setOf(e).color}">
      <span class="es-emoji">${setOf(e).emoji}</span>
      <span class="es-text"><b>${esc(e.t)}</b>${withDates ? `<span>${esc(fmtDate(e.d))}${e.time ? ' · ' + esc(fmtTime(e.time)) : ''}</span>` : e.k === 'holiday' ? '<span>Public holiday</span>' : `<span>${esc(setOf(e).name)}</span>`}</span>
    </button>`).join('')}</div>
  </section>`;
}

function renderList(vm) {
  const hasActive = vm.groups.some(g => g.tasks.length);
  let html = '';
  if (vm.banner && vm.banner.length) html += eventStrip('Today', vm.banner, false);
  if (vm.comingUp) html += eventStrip(`Coming up · ${setOf(vm.comingUp[0]).name}`, vm.comingUp, true);
  if (!hasActive && !vm.hideEmpty && vm.empty) {
    html += `<div class="empty">
      <div class="empty-art">${icon(vm.empty.icon)}</div>
      <h3>${esc(vm.empty.title)}</h3><p>${esc(vm.empty.text)}</p>
    </div>`;
  }
  for (const g of vm.groups) {
    if (!g.tasks.length && !g.keepEmpty) continue;
    const ck = `${viewKey()}|${g.key}`;
    const collapsed = !!ui.collapsedGroups[ck];
    html += `<section class="group ${g.tone || ''} ${g.compact ? 'compact' : ''}">`;
    html += groupHead(g, vm, collapsed);
    if (!collapsed) {
      html += `<div class="task-list">${g.tasks.map(t => taskRow(t, vm)).join('')}</div>`;
      if (g.add) html += inlineAdd(g.key, g.add);
    }
    html += '</section>';
  }
  if (vm.completed && vm.completed.length) {
    const open = ui.showCompleted[viewKey()] ?? (ui.view.id === 'today');
    html += `<section class="group completed-group">
      <header class="group-head">
        <div class="gh-main">
          <button class="gh-caret" data-action="toggle-completed" aria-expanded="${open}" aria-label="${open ? 'Hide' : 'Show'} completed">${icon('chevronRight', open ? 'rot' : '')}</button>
          <span class="status-pill solid" style="--sc:${statusOf('done').color}">${groupMode() === 'status' && vm.groupable ? 'Complete' : 'Completed'}</span>
          <span class="group-count">${vm.completed.length}</span>
          ${ui.view.type === 'list' && open ? `<button class="link-btn" data-action="clear-completed">Clear all</button>` : ''}
        </div>
      </header>
      ${open ? `<div class="task-list">${vm.completed.map(t => taskRow(t, vm)).join('')}</div>` : ''}
    </section>`;
  }
  return html;
}

function dueCell(t) {
  if (!t.due) return `<button class="cell-btn empty-cell" data-action="due-menu" aria-label="Set due date">${icon('calendar')}</button>`;
  return `<button class="cell-btn due ${dueClass(t)}" data-action="due-menu" title="${esc(fmtDue(t))}">${esc(fmtDue(t))}${t.repeat ? icon('repeat', 'cell-rep') : ''}</button>`;
}
function prioCell(t) {
  const p = prioOf(t.priority);
  if (!t.priority) return `<button class="cell-btn empty-cell" data-action="prio-menu" aria-label="Set priority">${icon('flag')}</button>`;
  return `<button class="cell-btn prio" data-action="prio-menu" style="--pc:${p.color}">${icon('flagFill')}<span>${p.label}</span></button>`;
}

function taskRow(t, vm, depth = 0) {
  const T = todayStr();
  const kids = vm.flat || vm.sub ? [] : childrenOf(t.id).sort((a, b) => (a.done - b.done) || a.order - b.order);
  const doneKids = kids.filter(k => k.done).length;
  const list = getList(t.listId);
  const meta = [];
  if (vm.flat && !vm.sub && t.parentId) {
    const p = getTask(t.parentId);
    if (p) meta.push(`<span class="chip muted">↳ ${esc(trunc(p.title, 28))}</span>`);
  }
  if (kids.length) meta.push(`<button class="chip sub-count ${doneKids === kids.length ? 'ok' : ''}" data-action="collapse" title="${t.collapsed ? 'Show' : 'Hide'} subtasks">${icon('subtasks')}${doneKids}/${kids.length}</button>`);
  if (!t.due && t.myDay === T && !t.done) meta.push(`<span class="chip today">${icon('sun')}My Day</span>`);
  if (t.notes.trim()) meta.push(`<span class="chip" title="${esc(trunc(t.notes, 120))}">${icon('note')}</span>`);
  if (t.remind != null && t.due && !t.done) meta.push(`<span class="chip" title="Reminder set">${icon('bell')}</span>`);
  t.tags.forEach(g => meta.push(`<button class="tag-chip" data-nav="tag:${esc(g)}">${esc(g)}</button>`));

  const extra = vm.showList
    ? (list && !t.parentId ? `<span class="list-chip">${avatar(list.name, list.color, 'xxs')}<span>${esc(list.name)}</span></span>` : '')
    : `<button class="cell-btn" data-action="status-menu">${statusPill(t.status)}</button>`;

  const cls = ['task', t.done && 'done', t.parentId && 'sub', ui.selectedId === t.id && 'selected', ui.openId === t.id && 'open'].filter(Boolean).join(' ');
  return `<div class="task-wrap">
    <div class="${cls}" data-task data-id="${t.id}" draggable="true">
      <div class="c-name">
        ${kids.length ? `<button class="caret" data-action="collapse" aria-label="${t.collapsed ? 'Show' : 'Hide'} subtasks" aria-expanded="${!t.collapsed}">${icon('chevronRight', t.collapsed ? '' : 'rot')}</button>` : '<span class="caret-space"></span>'}
        ${statusIco(t)}
        <div class="task-main" data-action="open">
          <span class="task-title">${t.title ? esc(t.title) : '<span class="muted">Untitled task</span>'}</span>
          ${meta.length ? `<span class="task-meta">${meta.join('')}</span>` : ''}
        </div>
        <button class="star ${t.starred ? 'on' : ''}" data-action="star" aria-label="${t.starred ? 'Unstar' : 'Star'}" aria-pressed="${t.starred}">${icon(t.starred ? 'starFill' : 'star')}</button>
      </div>
      <div class="c-due">${dueCell(t)}</div>
      <div class="c-prio">${prioCell(t)}</div>
      <div class="c-extra">${extra}</div>
    </div>
    ${kids.length && !t.collapsed ? `<div class="subtasks">${kids.map(k => taskRow(k, { ...vm, flat: false, showList: false, sub: true }, depth + 1)).join('')}</div>` : ''}
  </div>`;
}

function card(t) {
  const list = ui.view.type === 'list' ? null : getList(t.listId);
  const kids = childrenOf(t.id);
  const doneKids = kids.filter(k => k.done).length;
  const p = prioOf(t.priority);
  const meta = [];
  if (t.due) meta.push(`<span class="chip due ${dueClass(t)}">${icon(t.time ? 'clock' : 'calendar')}${esc(fmtDue(t))}</span>`);
  if (t.priority) meta.push(`<span class="chip" style="color:${p.color}">${icon('flagFill')}${p.label}</span>`);
  if (kids.length) meta.push(`<span class="chip ${doneKids === kids.length ? 'ok' : ''}">${icon('subtasks')}${doneKids}/${kids.length}</span>`);
  if (t.repeat) meta.push(`<span class="chip" title="${esc(repeatLabel(t.repeat))}">${icon('repeat')}</span>`);
  if (t.notes.trim()) meta.push(`<span class="chip">${icon('note')}</span>`);
  const cls = ['card', t.done && 'done', ui.selectedId === t.id && 'selected', ui.openId === t.id && 'open'].filter(Boolean).join(' ');
  return `<article class="${cls}" data-task data-id="${t.id}" draggable="true">
    <div class="card-top">
      ${list ? `<span class="card-list">${avatar(list.name, list.color, 'xxs')}${esc(list.name)}</span>` : ''}
      <button class="star ${t.starred ? 'on' : ''}" data-action="star" aria-label="${t.starred ? 'Unstar' : 'Star'}">${icon(t.starred ? 'starFill' : 'star')}</button>
    </div>
    <div class="card-title" data-action="open">${statusIco(t)}<span>${t.title ? esc(t.title) : '<span class="muted">Untitled task</span>'}</span></div>
    ${t.tags.length ? `<div class="card-tags">${t.tags.map(g => `<button class="tag-chip" data-nav="tag:${esc(g)}">${esc(g)}</button>`).join('')}</div>` : ''}
    ${meta.length ? `<div class="card-meta">${meta.join('')}</div>` : ''}
    ${kids.length ? `<div class="card-progress"><span style="width:${Math.round(doneKids / kids.length * 100)}%"></span></div>` : ''}
  </article>`;
}

function renderBoard(vm) {
  const items = vm.boardTasks || [];
  return `<div class="board">${STATUSES.map(s => {
    const col = s.v === 'done' ? byDoneDesc(items.filter(t => t.done)) : sortTasks(items.filter(t => !t.done && t.status === s.v), sortMode());
    const add = { status: s.v };
    if (ui.view.id === 'today') add.due = todayStr();
    return `<section class="board-col" data-status="${s.v}" style="--sc:${s.color}">
      <header class="col-head">
        ${statusPill(s.v, 'solid')}<span class="col-count">${col.length}</span>
        <span class="spacer"></span>
        ${s.v !== 'done' ? `<button class="icon-btn xs" data-action="inline-add" data-g="b:${s.v}" aria-label="Add task to ${s.label}" title="Add task">${icon('plus')}</button>` : ''}
      </header>
      <div class="col-body">
        ${col.map(card).join('')}
        ${s.v !== 'done' ? inlineAdd('b:' + s.v, add, 'card-add') : col.length ? '' : '<p class="col-empty">Drop a card here to complete it</p>'}
      </div>
    </section>`;
  }).join('')}</div>`;
}

/* ---------- Event calendars: Indian festivals, Art of Living, NGO planning days ---------- */
const EVENT_SETS = window.DOABLE_EVENT_SETS || {};
const FESTIVALS = window.DOABLE_FESTIVALS || [];
const eventYears = new Map();
function eventsForYear(y) {
  if (eventYears.has(y)) return eventYears.get(y);
  const out = [];
  const fest = FESTIVALS.filter(f => f.d.startsWith(y + '-'));
  fest.forEach(f => out.push({ set: 'festivals', d: f.d, t: f.t, k: f.k, tentative: !!f.tentative }));
  for (const [setId, set] of Object.entries(EVENT_SETS)) {
    if (setId === 'festivals') continue;
    const dated = (set.dated || []).filter(e => e.d.startsWith(y + '-'));
    const datedDays = new Set(dated.map(e => e.d));
    (set.annual || []).forEach(e => out.push({ set: setId, d: `${y}-${e.md}`, t: e.t, note: e.note, k: e.kind || 'event' }));
    dated.forEach(e => out.push({ set: setId, d: e.d, t: e.t, note: e.note, time: e.time, k: e.kind || 'event' }));
    (set.derive || []).forEach(r => fest.filter(f => r.match.test(f.t)).forEach(f => {
      if (!(r.skipIfDated && datedDays.has(f.d))) out.push({ set: setId, d: f.d, t: r.t, note: r.note, k: 'event' });
    }));
    (set.rules || []).forEach(r => out.push({ set: setId, d: ymd(r.date(y)), t: r.t, note: r.note, k: 'event' }));
  }
  out.forEach((e, i) => { e.id = `${y}:${i}`; });
  eventYears.set(y, out);
  return out;
}
const findEvent = id => eventsForYear(+id.split(':')[0]).find(e => e.id === id);
const setOf = e => EVENT_SETS[e.set] || { name: e.set, emoji: '•', color: '#888' };

// Which event calendars this view shows: festivals everywhere, plus the space calendars in scope.
function eventScope() {
  const v = ui.view;
  let spaces = SPACES;
  if (v.type === 'list') spaces = SPACES.filter(s => s.id === (getList(v.id) || {}).space);
  else if (v.type === 'smart' && v.id === 'calendar' && state.settings.calSpace !== 'all') spaces = SPACES.filter(s => s.id === state.settings.calSpace);
  else if (v.type === 'tag' || ui.search || v.id === 'completed') return [];
  return ['festivals', ...spaces.filter(s => s.events).map(s => s.events)];
}
const layerOn = id => (state.settings.calLayers || {})[id] !== false;
function eventsByDate(from, to, sets = eventScope().filter(layerOn)) {
  const map = {};
  if (!sets.length) return map;
  for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
    for (const e of eventsForYear(y)) if (e.d >= from && e.d <= to && sets.includes(e.set)) (map[e.d] = map[e.d] || []).push(e);
  }
  const rank = e => (e.k === 'holiday' ? 0 : e.set === 'festivals' ? 1 : 2);
  Object.values(map).forEach(a => a.sort((x, z) => rank(x) - rank(z) || (x.time || '').localeCompare(z.time || '')));
  return map;
}
const evPill = e => `<span class="ev-pill ${e.k}" style="--ec:${setOf(e).color}" title="${esc(setOf(e).name)}">${setOf(e).emoji} ${esc(e.t)}</span>`;
function dayEventsBlock(evs) {
  if (!evs || !evs.length) return '';
  return `<div class="day-events">${evs.map(e => {
    const s = setOf(e);
    const meta = [s.name, e.time && fmtTime(e.time), e.k === 'holiday' && 'Public holiday', e.k === 'deadline' && 'Deadline', e.tentative && 'Date may change'].filter(Boolean).join(' · ');
    return `<div class="day-ev ${e.k}" style="--ec:${s.color}">
      <span class="de-emoji" aria-hidden="true">${s.emoji}</span>
      <div class="de-main"><b>${esc(e.t)}</b><span class="de-meta">${esc(meta)}</span>${e.note ? `<span class="de-note">${esc(e.note)}</span>` : ''}</div>
      <button class="btn ghost sm" data-action="plan-event" data-ev="${e.id}" title="Create a task for this">${icon('plus')}<span>Plan</span></button>
    </div>`;
  }).join('')}</div>`;
}
function planEvent(id) {
  const e = findEvent(id);
  if (!e) return;
  const v = ui.view;
  const sp = SPACES.find(s => s.events === e.set);
  let list = sp && spaceList(sp.id);
  if (!list && v.type === 'list') list = getList(v.id);
  if (!list && v.type === 'smart' && v.id === 'calendar' && state.settings.calSpace !== 'all') list = spaceList(state.settings.calSpace);
  if (!list) list = getList(defaultListId());
  const task = newTask({ title: e.t, listId: list.id, due: e.d, time: e.time || null, notes: e.note || '', order: edgeOrder(list.id, null, true) });
  commit(() => { state.tasks.push(task); ui.flashId = task.id; });
  toast(`Planned in ${list.name}`, { action: { label: 'Open', fn: () => openDetails(task.id) } });
}

function calendarFilters() {
  const scope = eventScope();
  const isCalView = ui.view.type === 'smart' && ui.view.id === 'calendar';
  const cur = state.settings.calSpace || 'all';
  const spaces = isCalView ? `<div class="cal-spaces" role="tablist" aria-label="Calendar">
      <button class="space-chip ${cur === 'all' ? 'on' : ''}" data-action="cal-space" data-space="all">All</button>
      ${SPACES.map(s => { const l = spaceList(s.id); return l ? `<button class="space-chip ${cur === s.id ? 'on' : ''}" data-action="cal-space" data-space="${s.id}" style="--c:${l.color}"><i></i>${esc(l.name)}</button>` : ''; }).join('')}
    </div>` : '';
  const layers = scope.length ? `<div class="cal-layers">${scope.map(id => { const s = EVENT_SETS[id] || {}; return `<button class="layer-chip ${layerOn(id) ? 'on' : ''}" data-action="cal-layer" data-layer="${id}" style="--ec:${s.color}" aria-pressed="${layerOn(id)}" title="Show ${esc(s.name || id)}">${s.emoji || ''} ${esc(s.short || s.name || id)}</button>`; }).join('')}</div>` : '';
  return spaces || layers ? `<div class="cal-filters">${spaces}${layers}</div>` : '';
}

function renderCalendar(vm) {
  const m = ui.calMonth;
  const ws = state.settings.weekStart;
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const start = addDays(first, -((first.getDay() - ws + 7) % 7));
  const T = todayStr();
  const byDate = {};
  (vm.calTasks || []).filter(t => t.due).forEach(t => { (byDate[t.due] = byDate[t.due] || []).push(t); });
  Object.values(byDate).forEach(a => a.sort((x, y) => (x.done - y.done) || (x.time || '99').localeCompare(y.time || '99') || prioRank(x.priority) - prioRank(y.priority)));
  const evs = eventsByDate(ymd(start), ymd(addDays(start, 41)));
  const dayNames = [];
  for (let i = 0; i < 7; i++) dayNames.push(addDays(start, i).toLocaleDateString(LOCALE, { weekday: 'short' }));
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const ds = ymd(d);
    const items = byDate[ds] || [];
    const dayEvs = evs[ds] || [];
    const outside = d.getMonth() !== m.getMonth();
    const chips = [
      ...dayEvs.map(e => `<div class="cal-ev ${e.k}" style="--ec:${setOf(e).color}" title="${esc(setOf(e).name + ': ' + e.t)}"><span class="ev-emo">${setOf(e).emoji} </span>${esc(e.t)}</div>`),
      ...items.map(t => `<div class="cal-task ${t.done ? 'done' : ''}" style="--sc:${statusOf(t.status).color}" data-id="${t.id}" data-action="open" draggable="true" title="${esc(t.title)}">${t.time ? `<span class="cal-time">${esc(fmtTime(t.time))}</span>` : ''}${esc(t.title)}</div>`),
    ];
    const holiday = dayEvs.some(e => e.k === 'holiday');
    cells += `<div class="cal-cell ${outside ? 'outside' : ''} ${ds === T ? 'is-today' : ''} ${ds === ui.calDay ? 'is-selected' : ''} ${holiday ? 'is-holiday' : ''}" data-date="${ds}" role="gridcell" aria-label="${esc(d.toLocaleDateString(LOCALE, { dateStyle: 'full' }))}, ${plural(items.length, 'task')}${dayEvs.length ? ', ' + esc(dayEvs.map(e => e.t).join(', ')) : ''}">
      <div class="cal-day"><span>${d.getDate()}</span></div>
      <div class="cal-items">
        ${chips.slice(0, 3).join('')}
        ${chips.length > 3 ? `<div class="cal-more">+${chips.length - 3} more</div>` : ''}
      </div>
    </div>`;
  }
  const dayTasks = byDate[ui.calDay] || [];
  const unscheduled = (vm.calTasks || []).filter(t => !t.due && !t.done).length;
  return `
    ${calendarFilters()}
    <div class="cal">
      <div class="cal-head">
        <h2>${esc(m.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }))}</h2>
        <div class="cal-nav">
          <button class="btn ghost sm" data-action="cal-today">Today</button>
          <button class="icon-btn sm" data-action="cal-prev" aria-label="Previous month">${icon('chevronLeft')}</button>
          <button class="icon-btn sm" data-action="cal-next" aria-label="Next month">${icon('chevronRight')}</button>
        </div>
      </div>
      <div class="cal-grid" role="grid">
        ${dayNames.map(n => `<div class="cal-dow">${esc(n)}</div>`).join('')}
        ${cells}
      </div>
    </div>
    <section class="group cal-day-list">
      ${groupHead({ key: 'cal', title: fmtDate(ui.calDay), hint: fmtShort(ui.calDay), tasks: dayTasks }, { ...vm, showList: true }, false)}
      ${dayEventsBlock(eventsByDate(ui.calDay, ui.calDay)[ui.calDay])}
      <div class="task-list">${dayTasks.map(t => taskRow(t, { ...vm, flat: false, showList: true })).join('')}</div>
      ${inlineAdd('cal:' + ui.calDay, { due: ui.calDay })}
      ${unscheduled ? `<p class="muted pad small">${plural(unscheduled, 'task')} without a date ${ui.view.type === 'list' ? 'in this list' : ''} — switch to List view to see them.</p>` : ''}
    </section>`;
}

function renderQaPreview() {
  const el = $('#qaPreview');
  const input = $('#qaInput');
  const v = input.value.trim();
  if (!v) {
    el.innerHTML = document.activeElement === input
      ? `<span class="qa-tip">${icon('sparkles')} Try: <em>${esc(QA_EXAMPLES[Math.floor(Date.now() / 8000) % QA_EXAMPLES.length])}</em> · <kbd>#tag</kbd> <kbd>@list</kbd> <kbd>!1</kbd>–<kbd>!4</kbd> <kbd>*</kbd> star</span>`
      : '';
    return;
  }
  const p = QuickParse.parse(v, { lists: state.lists, monthFirst: MONTH_FIRST });
  const d = quickAddDefaults();
  const chips = [];
  const list = getList(p.listId || d.listId);
  if (list) chips.push(`<span class="pchip ${p.listId ? 'hit' : ''}">${avatar(list.name, list.color, 'xxs')}${esc(list.name)}</span>`);
  const due = p.due || d.due;
  if (due) chips.push(`<span class="pchip ${p.due ? 'hit' : ''}">${icon('calendar')}${esc(fmtDate(due))}${p.time ? ' · ' + esc(fmtTime(p.time)) : ''}</span>`);
  if (p.repeat) chips.push(`<span class="pchip hit">${icon('repeat')}${esc(repeatLabel(p.repeat))}</span>`);
  if (p.priority) chips.push(`<span class="pchip hit" style="--pc:${prioOf(p.priority).color}">${icon('flagFill')}${prioOf(p.priority).label}</span>`);
  if (p.starred || d.starred) chips.push(`<span class="pchip ${p.starred ? 'hit' : ''}">${icon('starFill')}Starred</span>`);
  [...new Set([...(d.tags || []), ...p.tags])].forEach(g => chips.push(`<span class="pchip ${p.tags.includes(g) ? 'hit' : ''}">#${esc(g)}</span>`));
  el.innerHTML = `<span class="qa-title">“${esc(p.title)}”</span>${chips.join('')}<span class="qa-enter"><kbd>Enter</kbd> to add</span>`;
}

/* ---------- Details (task modal) ---------- */
function openDetails(id) {
  ui.openId = id;
  ui.selectedId = id;
  document.body.classList.remove('sidebar-open');
  closeMenu();
  renderMain();
  renderDetails();
}
function closeDetails() {
  ui.openId = null;
  renderMain();
  renderDetails();
}

function renderDetails() {
  const el = $('#details');
  const t = ui.openId && getTask(ui.openId);
  document.body.classList.toggle('details-open', !!t);
  if (!t) { el.innerHTML = ''; return; }
  const kids = childrenOf(t.id).sort((a, b) => a.order - b.order);
  const doneKids = kids.filter(k => k.done).length;
  const parent = t.parentId && getTask(t.parentId);
  const list = getList(t.listId);
  const repeatUnit = t.repeat && { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[t.repeat.freq];
  const T = todayStr();
  const p = prioOf(t.priority);
  const st = statusOf(t.status);
  const keepScroll = $('.dm-body', el)?.scrollTop || 0;
  el.innerHTML = `
    <div class="dm-backdrop" data-d="close"></div>
    <div class="dm" role="dialog" aria-modal="true" aria-label="Task details">
      <header class="dm-top">
        <div class="dm-crumbs">
          ${list ? `${avatar(list.name, list.color, 'xs')}<span>${esc(list.name)}</span>` : ''}
          ${parent ? `${icon('chevronRight', 'crumb-sep')}<button class="link" data-d="open-parent">${esc(trunc(parent.title, 36))}</button>` : ''}
        </div>
        <div class="dm-actions">
          <span class="muted small dm-created">Created ${esc(new Date(t.createdAt).toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' }))}</span>
          <button class="icon-btn sm star-btn ${t.starred ? 'on' : ''}" data-d="star" title="${t.starred ? 'Unstar' : 'Star'} (S)" aria-label="${t.starred ? 'Unstar' : 'Star'}">${icon(t.starred ? 'starFill' : 'star')}</button>
          <button class="icon-btn sm" data-d="duplicate" title="Duplicate" aria-label="Duplicate">${icon('copy')}</button>
          <button class="icon-btn sm danger" data-d="delete" title="Delete (Del)" aria-label="Delete">${icon('trash')}</button>
          <button class="icon-btn sm" data-d="close" title="Close (Esc)" aria-label="Close">${icon('x')}</button>
        </div>
      </header>
      <div class="dm-body">
        <div class="dm-status-row">
          <div class="status-split" style="--sc:${st.color}">
            <button class="ss-main" data-d="status-menu" title="Change status">${esc(st.label)}${icon('chevronDown')}</button>
            <button class="ss-next" data-d="toggle" title="${t.done ? 'Reopen' : 'Mark complete'}" aria-label="${t.done ? 'Reopen' : 'Mark complete'}">${icon('check')}</button>
          </div>
          ${t.repeat ? `<span class="soft-chip">${icon('repeat')}${esc(repeatLabel(t.repeat))}</span>` : ''}
          ${t.done && t.doneAt ? `<span class="soft-chip ok">${icon('checkCircle')}Done ${esc(fmtDate(ymd(new Date(t.doneAt)), false))}</span>` : ''}
        </div>
        <textarea class="d-title ${t.done ? 'done' : ''}" rows="1" data-field="title" placeholder="Task name" aria-label="Task name">${esc(t.title)}</textarea>

        <div class="props">
          <div class="prop">
            <label for="d-due">${icon('calendar')}Due date</label>
            <div class="prop-val col">
              <div class="row">
                <input id="d-due" type="date" data-field="due" value="${t.due || ''}">
                <input type="time" data-field="time" value="${t.time || ''}" aria-label="Time">
              </div>
              <div class="quick-chips">
                <button class="qchip ${t.due === T ? 'on' : ''}" data-d="due" data-v="0">Today</button>
                <button class="qchip ${t.due === ymd(addDays(new Date(), 1)) ? 'on' : ''}" data-d="due" data-v="1">Tomorrow</button>
                <button class="qchip ${t.due === nextWeekStr() ? 'on' : ''}" data-d="due" data-v="nextweek">Next week</button>
                ${t.due ? `<button class="qchip" data-d="due" data-v="clear">${icon('x')}Clear</button>` : ''}
              </div>
            </div>
          </div>
          <div class="prop">
            <label>${icon('flag')}Priority</label>
            <div class="prop-val">
              <button class="prop-btn" data-d="prio-menu" ${t.priority ? `style="--pc:${p.color}"` : ''}>${icon(t.priority ? 'flagFill' : 'flag', t.priority ? 'pc' : '')}<span>${t.priority ? p.label : 'Set priority'}</span>${icon('chevronDown', 'chev')}</button>
            </div>
          </div>
          ${!t.parentId ? `
          <div class="prop">
            <label for="d-list">${icon('folder')}List</label>
            <div class="prop-val"><select id="d-list" data-field="listId">${state.lists.map(l => `<option value="${l.id}" ${l.id === t.listId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
          </div>
          <div class="prop">
            <label for="d-repeat">${icon('repeat')}Repeat</label>
            <div class="prop-val row wrap">
              <select id="d-repeat" data-field="repeatFreq">
                ${[['none', 'Does not repeat'], ['daily', 'Daily'], ['weekdays', 'Every weekday'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']]
                  .map(([v, l]) => `<option value="${v}" ${(t.repeat ? t.repeat.freq : 'none') === v ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
              ${repeatUnit ? `<span class="muted">every</span><input class="num" type="number" min="1" max="99" data-field="repeatInterval" value="${t.repeat.interval}" aria-label="Repeat interval"><span class="muted">${repeatUnit}${t.repeat.interval === 1 ? '' : 's'}</span>` : ''}
            </div>
          </div>` : ''}
          <div class="prop">
            <label for="d-remind">${icon('bell')}Reminder</label>
            <div class="prop-val col">
              <select id="d-remind" data-field="remind" ${t.due ? '' : 'disabled'}>
                ${REMINDERS.map(r => `<option value="${r.v}" ${String(t.remind ?? '') === String(r.v) ? 'selected' : ''}>${r.label}</option>`).join('')}
              </select>
              ${!t.due ? '<span class="hint">Set a due date first</span>' : !t.time && t.remind != null ? '<span class="hint">No time set — reminds at 9:00 AM</span>' : ''}
            </div>
          </div>
          <div class="prop">
            <label for="d-tag">${icon('tag')}Tags</label>
            <div class="prop-val">
              <div class="tags-edit">
                ${t.tags.map(g => `<span class="tag-pill">${esc(g)}<button data-d="tag-remove" data-v="${esc(g)}" aria-label="Remove tag ${esc(g)}">${icon('x')}</button></span>`).join('')}
                <input id="d-tag" data-d-input="tag" placeholder="${t.tags.length ? 'Add…' : 'Add a tag…'}" autocomplete="off">
              </div>
            </div>
          </div>
          ${!t.parentId ? `
          <div class="prop">
            <label>${icon('sun')}My Day</label>
            <div class="prop-val"><button class="toggle-btn ${t.myDay === T ? 'on' : ''}" data-d="myday">${t.myDay === T ? `${icon('check')}In Today` : `${icon('plus')}Add to Today`}</button></div>
          </div>` : ''}
        </div>

        <section class="dm-section">
          <h3>${icon('note')}Description</h3>
          <textarea id="d-notes" class="d-notes" data-field="notes" placeholder="Add details, links, ideas…" aria-label="Description">${esc(t.notes)}</textarea>
        </section>

        ${!t.parentId ? `
        <section class="dm-section">
          <h3>${icon('subtasks')}Subtasks ${kids.length ? `<span class="muted">${doneKids}/${kids.length}</span><span class="sub-bar"><span style="width:${Math.round(doneKids / kids.length * 100)}%"></span></span>` : ''}</h3>
          <div class="d-subs">
            ${kids.map(k => `<div class="d-sub ${k.done ? 'done' : ''}" data-sub="${k.id}">
              <button class="status-ico s-${k.status}" style="--sc:${statusOf(k.status).color}" data-d="sub-toggle" role="checkbox" aria-checked="${k.done}" aria-label="Complete subtask">${icon('check')}</button>
              <input value="${esc(k.title)}" data-sub-field="title" aria-label="Subtask title">
              <button class="icon-btn xs" data-d="sub-open" title="Open subtask" aria-label="Open subtask">${icon('chevronRight')}</button>
              <button class="icon-btn xs" data-d="sub-del" title="Delete subtask" aria-label="Delete subtask">${icon('x')}</button>
            </div>`).join('')}
            <div class="d-sub add">${icon('plus')}<input class="d-sub-add" data-d-input="subtask" placeholder="Add a subtask" autocomplete="off"></div>
          </div>
        </section>` : ''}
      </div>
    </div>`;
  $$('textarea', el).forEach(autosize);
  const body = $('.dm-body', el);
  if (body) body.scrollTop = keepScroll;
}
function autosize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 2 + 'px';
}

let editSnap = false;
function bindDetails() {
  const det = $('#details');
  det.addEventListener('focusin', () => { editSnap = false; });
  det.addEventListener('click', e => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const t = getTask(ui.openId);
    if (!t) return;
    const sub = b.closest('[data-sub]')?.dataset.sub;
    switch (b.dataset.d) {
      case 'close': closeDetails(); break;
      case 'toggle': toggleComplete(t.id); break;
      case 'star': toggleStar(t.id); break;
      case 'status-menu': menuAt(b, statusMenuItems(t.id), false); break;
      case 'prio-menu': menuAt(b, prioMenuItems(t.id), false); break;
      case 'due': {
        const v = b.dataset.v;
        setDue(t.id, v === 'clear' ? null : v === 'nextweek' ? nextWeekStr() : ymd(addDays(new Date(), +v)));
        break;
      }
      case 'myday': commit(() => { t.myDay = t.myDay === todayStr() ? null : todayStr(); }); break;
      case 'tag-remove': commit(() => { t.tags = t.tags.filter(x => x !== b.dataset.v); }); break;
      case 'sub-toggle': toggleComplete(sub); break;
      case 'sub-del': deleteTask(sub); break;
      case 'sub-open': openDetails(sub); break;
      case 'open-parent': openDetails(t.parentId); break;
      case 'duplicate': duplicateTask(t.id); break;
      case 'delete': deleteTask(t.id); break;
    }
  });
  det.addEventListener('input', e => {
    const t = getTask(ui.openId);
    if (!t) return;
    const f = e.target.dataset.field;
    const sf = e.target.dataset.subField;
    if (f === 'title' || f === 'notes' || sf) {
      if (!editSnap) { snapshot(); editSnap = true; touch(); }
      if (sf) {
        const k = getTask(e.target.closest('[data-sub]').dataset.sub);
        if (k) k.title = e.target.value;
      } else {
        t[f] = f === 'title' ? e.target.value.replace(/\n/g, ' ') : e.target.value;
        if (e.target.tagName === 'TEXTAREA') autosize(e.target);
      }
      save();
      scheduleMainRender();
    }
  });
  det.addEventListener('change', e => {
    const t = getTask(ui.openId);
    if (!t) return;
    const f = e.target.dataset.field;
    const v = e.target.value;
    switch (f) {
      case 'listId': moveToList(t.id, v); break;
      case 'due': commit(() => { t.due = v || null; if (!t.due) { t.time = null; t.remind = null; t.repeat = null; } t.notifiedFor = null; }); break;
      case 'time': commit(() => { t.time = v || null; if (t.time && !t.due) t.due = todayStr(); t.notifiedFor = null; }); break;
      case 'repeatFreq': commit(() => {
        t.repeat = v === 'none' ? null : { freq: v, interval: (t.repeat && t.repeat.interval) || 1 };
        if (t.repeat && !t.due) t.due = todayStr();
      }); break;
      case 'repeatInterval': commit(() => { if (t.repeat) t.repeat.interval = clamp(parseInt(v, 10) || 1, 1, 99); }); break;
      case 'remind': commit(() => { t.remind = v === '' ? null : +v; t.notifiedFor = null; }); if (v !== '') askNotifyPermission(); break;
    }
  });
  det.addEventListener('keydown', e => {
    const t = getTask(ui.openId);
    if (!t) return;
    const kind = e.target.dataset.dInput;
    if (kind === 'tag') {
      if ((e.key === 'Enter' || e.key === ',' || e.key === ' ') && e.target.value.trim()) {
        e.preventDefault();
        const g = normTag(e.target.value);
        if (g) commit(() => { if (!t.tags.includes(g)) t.tags.push(g); });
        $('[data-d-input="tag"]', det)?.focus();
      } else if (e.key === 'Backspace' && !e.target.value && t.tags.length) {
        commit(() => { t.tags.pop(); });
        $('[data-d-input="tag"]', det)?.focus();
      }
    } else if (kind === 'subtask' && e.key === 'Enter') {
      e.preventDefault();
      const v = e.target.value.trim();
      if (v) { addSubtask(t, v); $('.d-sub-add', det)?.focus(); }
    } else if (e.target.dataset.field === 'title' && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    } else if (e.target.dataset.subField && e.key === 'Enter') {
      e.preventDefault();
      $('.d-sub-add', det)?.focus();
    }
  });
}

/* ---------- Toasts, menus, modals ---------- */
function toast(msg, opts = {}) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${opts.undo ? '<button class="toast-btn" data-t="undo">Undo</button>' : ''}${opts.action ? `<button class="toast-btn" data-t="action">${esc(opts.action.label)}</button>` : ''}<button class="toast-x" data-t="close" aria-label="Dismiss">${icon('x')}</button>`;
  const remove = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    if (b.dataset.t === 'undo') undo();
    if (b.dataset.t === 'action') opts.action.fn();
    remove();
  });
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(remove, opts.duration || 5000);
}

function openMenu(x, y, items, alignRight = false) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => {
    if (it.sep) return '<div class="menu-sep"></div>';
    if (it.header) return `<div class="menu-header">${esc(it.header)}</div>`;
    const lead = it.status ? `<span class="status-ico s-${it.status} mini" style="--sc:${statusOf(it.status).color}"></span>`
      : it.dot ? avatar(it.label, it.dot, 'xxs')
      : it.icon ? `<span class="mi-ico" ${it.color ? `style="color:${it.color}"` : ''}>${icon(it.icon)}</span>` : '<span class="i"></span>';
    return `<button class="menu-item ${it.danger ? 'danger' : ''}" data-i="${i}" role="menuitem">
      ${lead}<span class="menu-label">${esc(it.label)}</span>
      ${it.checked ? `<span class="menu-check">${icon('check')}</span>` : it.hint ? `<kbd>${esc(it.hint)}</kbd>` : ''}
    </button>`;
  }).join('');
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  const left = alignRight ? x - r.width : x;
  m.style.left = clamp(left, 8, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const it = items[+b.dataset.i];
    closeMenu();
    it.action();
  });
  ui.menu = m;
  m.querySelector('.menu-item')?.focus();
}
function menuAt(el, items, alignRight = true) {
  const r = el.getBoundingClientRect();
  openMenu(alignRight ? r.right : r.left, r.bottom + 6, items, alignRight);
}
function closeMenu() {
  if (ui.menu) { ui.menu.remove(); ui.menu = null; }
}

const statusMenuItems = id => {
  const t = getTask(id);
  return [{ header: 'Status' }, ...STATUSES.map(s => ({ label: s.label, status: s.v, checked: t.status === s.v, action: () => setStatus(id, s.v) }))];
};
const prioMenuItems = id => {
  const t = getTask(id);
  return [{ header: 'Priority' }, ...PRIORITIES.map(p => ({ label: p.v ? p.label : 'Clear', icon: p.v ? 'flagFill' : 'x', color: p.color, checked: t.priority === p.v && p.v !== 0, hint: String(p.v || 0), action: () => setPriority(id, p.v) }))];
};
const dueMenuItems = (id, anchor) => {
  const t = getTask(id);
  const T = todayStr();
  const tm = ymd(addDays(new Date(), 1));
  const we = ymd(nextWeekday(startOfDay(new Date()), 6, true));
  return [
    { header: 'Due date' },
    { label: 'Today', icon: 'sun', checked: t.due === T, hint: fmtShort(T), action: () => setDue(id, T) },
    { label: 'Tomorrow', icon: 'arrowRight', checked: t.due === tm, hint: fmtShort(tm), action: () => setDue(id, tm) },
    { label: 'This weekend', icon: 'calendar', checked: t.due === we, hint: fmtShort(we), action: () => setDue(id, we) },
    { label: 'Next week', icon: 'calendar', checked: t.due === nextWeekStr(), hint: fmtShort(nextWeekStr()), action: () => setDue(id, nextWeekStr()) },
    { label: 'Pick a date…', icon: 'edit', action: () => pickDate(id, anchor) },
    ...(t.due ? [{ sep: true }, { label: 'Remove date', icon: 'x', action: () => setDue(id, null) }] : []),
  ];
};
function pickDate(id, anchor) {
  const t = getTask(id);
  const inp = document.createElement('input');
  inp.type = 'date';
  inp.value = t.due || todayStr();
  const r = anchor ? anchor.getBoundingClientRect() : { left: innerWidth / 2, bottom: innerHeight / 2 };
  Object.assign(inp.style, { position: 'fixed', left: r.left + 'px', top: r.bottom + 'px', opacity: '0', width: '1px', height: '1px', border: '0' });
  document.body.appendChild(inp);
  inp.addEventListener('change', () => { if (inp.value) setDue(id, inp.value); inp.remove(); });
  inp.addEventListener('blur', () => setTimeout(() => inp.remove(), 400));
  try { inp.focus(); inp.showPicker(); } catch { inp.remove(); openDetails(id); }
}

function taskMenu(id, x, y) {
  const t = getTask(id);
  if (!t) return;
  const T = todayStr();
  openMenu(x, y, [
    { label: t.done ? 'Reopen' : 'Complete', icon: 'check', hint: 'X', action: () => toggleComplete(id) },
    { label: 'Status…', icon: 'status', hint: '[ ]', action: () => openMenu(x, y, statusMenuItems(id)) },
    { label: 'Priority…', icon: 'flag', hint: '1–4', action: () => openMenu(x, y, prioMenuItems(id)) },
    { label: 'Due date…', icon: 'calendar', hint: 'T', action: () => openMenu(x, y, dueMenuItems(id, null)) },
    { sep: true },
    { label: t.starred ? 'Remove star' : 'Star', icon: t.starred ? 'starFill' : 'star', hint: 'S', action: () => toggleStar(id) },
    ...(!t.parentId ? [
      { label: t.myDay === T ? 'Remove from My Day' : 'Add to My Day', icon: 'sun', action: () => commit(() => { t.myDay = t.myDay === T ? null : T; }) },
      { label: 'Move to list…', icon: 'folder', action: () => openMenu(x, y, state.lists.map(l => ({ label: l.name, dot: l.color, checked: l.id === t.listId, action: () => moveToList(id, l.id) }))) },
    ] : [{ label: 'Make a regular task', icon: 'arrowRight', hint: '⇧Tab', action: () => outdent(id) }]),
    { label: 'Open', icon: 'edit', hint: '↵', action: () => openDetails(id) },
    { label: 'Duplicate', icon: 'copy', action: () => duplicateTask(id) },
    { sep: true },
    { label: 'Delete', icon: 'trash', danger: true, hint: 'Del', action: () => deleteTask(id) },
  ]);
}

let modalResolve = null;
function openModal(html, mount) {
  closeModal();
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const back = root.firstElementChild;
  const m = back.firstElementChild;
  back.addEventListener('mousedown', e => { if (e.target === back) closeModal(); });
  m.addEventListener('click', e => { if (e.target.closest('[data-m="cancel"]')) closeModal(); });
  if (mount) mount(m);
  requestAnimationFrame(() => (m.querySelector('[autofocus]') || m.querySelector('input, select, button'))?.focus());
}
function closeModal() {
  $('#modalRoot').innerHTML = '';
  if (modalResolve) { const r = modalResolve; modalResolve = null; r(false); }
}
const modalOpen = () => !!$('#modalRoot .modal');

function confirmDialog({ title, message, confirm = 'Delete', danger = true }) {
  return new Promise(resolve => {
    openModal(`
      <div class="modal-card">
        <h2>${esc(title)}</h2>
        <p class="muted">${esc(message)}</p>
        <div class="modal-actions">
          <span class="spacer"></span>
          <button class="btn ghost" data-m="cancel">Cancel</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-m="ok" autofocus>${esc(confirm)}</button>
        </div>
      </div>`, m => {
      m.querySelector('[data-m="ok"]').addEventListener('click', () => { modalResolve = null; closeModal(); resolve(true); });
    });
    modalResolve = resolve;
  });
}

function editList(listId) {
  const l = listId ? getList(listId) : { name: '', color: LIST_COLORS[state.lists.length % LIST_COLORS.length] };
  const count = listId ? state.tasks.filter(t => t.listId === listId).length : 0;
  openModal(`
    <form class="modal-card" id="listForm">
      <h2>${listId ? 'List settings' : 'Create a list'}</h2>
      <div class="list-preview">${avatar(l.name || 'New', l.color, 'lg')}<span class="lp-name">${esc(l.name || 'New list')}</span></div>
      <label class="lbl">Name
        <input name="name" value="${esc(l.name)}" required maxlength="60" placeholder="e.g. Marketing, Groceries, Side project" autofocus autocomplete="off">
      </label>
      <div class="lbl">Color
        <div class="swatches">${LIST_COLORS.map(c => `<label class="swatch"><input type="radio" name="color" value="${c}" ${c === l.color ? 'checked' : ''}><span style="--c:${c}"></span></label>`).join('')}</div>
      </div>
      ${listId ? `<label class="check-row"><input type="checkbox" name="isDefault" ${defaultListId() === listId ? 'checked' : ''}> Default list for new tasks</label>` : ''}
      <div class="modal-actions">
        ${listId && state.lists.length > 1 ? `<button type="button" class="btn ghost danger-text" data-m="delete">${icon('trash')}Delete</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-m="cancel">Cancel</button>
        <button type="submit" class="btn primary">${listId ? 'Save' : 'Create list'}</button>
      </div>
    </form>`, m => {
    const form = m.querySelector('form');
    const prev = m.querySelector('.list-preview');
    const refreshPreview = () => {
      const fd = new FormData(form);
      const name = String(fd.get('name') || '').trim() || 'New list';
      prev.innerHTML = `${avatar(name, String(fd.get('color') || l.color), 'lg')}<span class="lp-name">${esc(name)}</span>`;
    };
    form.addEventListener('input', refreshPreview);
    form.addEventListener('change', refreshPreview);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const name = String(fd.get('name')).trim();
      if (!name) return;
      const color = String(fd.get('color') || l.color);
      if (listId) {
        commit(() => {
          l.name = name; l.color = color;
          if (fd.get('isDefault')) state.settings.defaultListId = listId;
        });
        closeModal();
      } else {
        const nl = { id: uid(), name, color };
        commit(() => { state.lists.push(nl); });
        closeModal();
        navigate(`list:${nl.id}`);
        $('#qaInput').focus();
      }
    });
    m.querySelector('[data-m="delete"]')?.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: `Delete “${l.name}”?`, message: count ? `This also deletes ${plural(count, 'task')} in this list. You can undo right after.` : 'This list is empty.' });
      if (!ok) return;
      commit(() => {
        state.lists = state.lists.filter(x => x.id !== listId);
        state.tasks = state.tasks.filter(t => t.listId !== listId);
        if (ui.openId && !getTask(ui.openId)) ui.openId = null;
        if (state.settings.defaultListId === listId) state.settings.defaultListId = state.lists[0].id;
        if (ui.view.type === 'list' && ui.view.id === listId) ui.view = { type: 'smart', id: 'today' };
      }, { toast: `Deleted list “${l.name}”` });
    });
  });
}

function openSettings() {
  const s = state.settings;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  openModal(`
    <div class="modal-card wide">
      <div class="modal-title-row"><h2>Settings</h2><button class="icon-btn sm" data-m="cancel" aria-label="Close">${icon('x')}</button></div>
      <div class="set-row">
        <div><b>Theme</b></div>
        <div class="seg" data-set="theme">${['system', 'light', 'dark'].map(v => `<button class="${s.theme === v ? 'on' : ''}" data-v="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
      </div>
      <div class="set-row">
        <div><b>Accent color</b></div>
        <div class="swatches" data-set="accent">${ACCENTS.map(c => `<button class="swatch-btn ${s.accent === c ? 'on' : ''}" data-v="${c}" style="--c:${c}" aria-label="Accent ${c}"></button>`).join('')}</div>
      </div>
      <div class="set-row">
        <div><b>Week starts on</b></div>
        <select data-set="weekStart">${[[1, 'Monday'], [0, 'Sunday'], [6, 'Saturday']].map(([v, l]) => `<option value="${v}" ${s.weekStart === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="set-row">
        <div><b>New tasks go to</b></div>
        <select data-set="newOnTop"><option value="1" ${s.newOnTop ? 'selected' : ''}>Top of list</option><option value="0" ${!s.newOnTop ? 'selected' : ''}>Bottom of list</option></select>
      </div>
      <div class="set-row">
        <div><b>Default list</b><div class="muted small">Where tasks go from smart views</div></div>
        <select data-set="defaultListId">${state.lists.map(l => `<option value="${l.id}" ${defaultListId() === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
      </div>
      <div class="set-row">
        <div><b>Reminder notifications</b><div class="muted small">${perm === 'granted' ? 'Enabled — you’ll get desktop notifications.' : perm === 'denied' ? 'Blocked in your browser settings.' : perm === 'unsupported' ? 'Not supported in this browser.' : 'Get a pop-up when a reminder is due.'}</div></div>
        ${perm === 'default' ? '<button class="btn ghost sm" data-act="notify">Enable</button>' : ''}
      </div>
      <div class="set-row">
        <div><b>Cloud sync</b><div class="muted small">${window.DoableSync && DoableSync.user ? `Signed in as ${esc(DoableSync.user.email)}` : 'Keep tasks identical on all your devices.'}</div></div>
        <button class="btn ghost sm" data-act="account">${icon('cloud')}${window.DoableSync && DoableSync.user ? 'Manage' : 'Sign in'}</button>
      </div>
      <h3 class="set-h">Your data</h3>
      <p class="muted small">Your tasks are always saved on this device first${window.DoableSync && DoableSync.user ? ' and synced to your account' : ''}. Export a backup any time.</p>
      <div class="row wrap gap">
        <button class="btn ghost sm" data-act="export">${icon('download')}Export backup</button>
        <label class="btn ghost sm">${icon('upload')}Import backup<input type="file" accept="application/json,.json" data-act="import" hidden></label>
        <span class="spacer"></span>
        <button class="btn ghost sm danger-text" data-act="reset">${icon('trash')}Reset everything</button>
      </div>
    </div>`, m => {
    m.addEventListener('click', async e => {
      const seg = e.target.closest('[data-set] [data-v]');
      if (seg) {
        const key = seg.closest('[data-set]').dataset.set;
        state.settings[key] = seg.dataset.v;
        save(); applyTheme(); render();
        $$('[data-v]', seg.parentElement).forEach(b => b.classList.toggle('on', b === seg));
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'export') exportData();
      if (act === 'account') openAccount();
      if (act === 'notify') { await askNotifyPermission(true); openSettings(); }
      if (act === 'reset') {
        const ok = await confirmDialog({ title: 'Reset everything?', message: 'All lists and tasks on this device will be replaced with the starter set. Export a backup first if you want to keep them.', confirm: 'Reset' });
        if (ok) commit(() => { state = seedState(); ui.view = { type: 'smart', id: 'today' }; ui.openId = null; applyTheme(); }, { toast: 'Reset complete' });
      }
    });
    m.addEventListener('change', e => {
      const sel = e.target.closest('select[data-set]');
      if (sel) {
        const key = sel.dataset.set;
        state.settings[key] = key === 'weekStart' ? +sel.value : key === 'newOnTop' ? sel.value === '1' : sel.value;
        save(); render();
      }
      if (e.target.dataset.act === 'import' && e.target.files[0]) importData(e.target.files[0]);
    });
  });
}

function openShortcuts() {
  const rows = [
    ['N', 'New task'], ['/', 'Search'], ['J / K', 'Move down / up'], ['X or Space', 'Complete task'],
    ['Enter or E', 'Open task'], ['[ / ]', 'Previous / next status'], ['S', 'Star / unstar'], ['T', 'Due today'],
    ['Shift + T', 'Due tomorrow'], ['1 2 3 4', 'Urgent → Low'], ['0', 'Clear priority'],
    ['Tab / Shift + Tab', 'Make subtask / undo it'], ['Del', 'Delete task'], ['Ctrl + Z', 'Undo'],
    ['V', 'Cycle List → Board → Calendar'], ['G then T/U/S/A/C', 'Today, Upcoming, Starred, All, Completed'],
    ['G then 1–9', 'Go to list #'], ['Esc', 'Close / clear'], ['?', 'This help'],
  ];
  const syntax = [
    ['tomorrow, fri, next week, in 3 days, dec 25', 'Due date'], ['6pm, 9:30, at 5, tonight', 'Time'],
    ['every day, every weekday, every 2 weeks, monthly', 'Repeat'], ['!1 urgent · !2 high · !3 normal · !4 low', 'Priority'],
    ['#errands', 'Tag'], ['@work', 'List'], ['*', 'Star'],
  ];
  openModal(`
    <div class="modal-card wide">
      <div class="modal-title-row"><h2>Shortcuts & quick-add</h2><button class="icon-btn sm" data-m="cancel" aria-label="Close">${icon('x')}</button></div>
      <div class="sc-cols">
        <div><h3 class="set-h">Keyboard</h3><dl class="sc">${rows.map(([k, d]) => `<div><dt>${k.split(' ').map(x => k !== '/' && ['/', 'or', 'then', '+', '→'].includes(x) ? `<span class="muted">${esc(x)}</span>` : `<kbd>${esc(x)}</kbd>`).join(' ')}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl></div>
        <div><h3 class="set-h">Type naturally</h3><dl class="sc">${syntax.map(([k, d]) => `<div><dt><code>${esc(k)}</code></dt><dd>${esc(d)}</dd></div>`).join('')}</dl>
        <p class="muted small">Example: <code>Pay rent every month !1 #home @personal</code></p></div>
      </div>
    </div>`);
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `doable-backup-${todayStr()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup downloaded');
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    let data;
    try { data = normalize(JSON.parse(reader.result), { fixOrphans: true }); }
    catch { toast('That file isn’t a valid Doable backup'); return; }
    const ok = await confirmDialog({ title: 'Replace your data?', message: `Import ${plural(data.lists.length, 'list')} and ${plural(data.tasks.length, 'task')}? Your current data will be replaced (you can undo).`, confirm: 'Import', danger: false });
    if (ok) commit(() => { state = data; ui.view = { type: 'smart', id: 'today' }; ui.openId = null; applyTheme(); }, { toast: 'Backup imported' });
  };
  reader.readAsText(file);
}

/* ---------- Theme ---------- */
const darkMq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const s = state.settings;
  const theme = s.theme === 'system' ? (darkMq.matches ? 'dark' : 'light') : s.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--accent', s.accent);
  $('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#17181b' : '#ffffff');
  // Android: light icons on dark theme, dark icons on light theme
  if (native.SystemBars) native.SystemBars.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => {});
}
darkMq.addEventListener?.('change', () => { applyTheme(); renderSidebar(); });

/* ---------- Navigation ---------- */
function navigate(key) {
  const [type, ...rest] = key.split(':');
  ui.view = { type, id: rest.join(':') };
  ui.search = '';
  $('#search').value = '';
  ui.addDue = null;
  ui.selectedId = null;
  ui.inlineKey = null;
  ui.mode = state.settings.modes[key] || 'list';
  state.settings.lastView = key;
  save();
  document.body.classList.remove('sidebar-open');
  render({ keepDetails: true });
  $('#scroller').scrollTop = 0;
  syncHash();
}
function setMode(m) {
  ui.mode = m;
  ui.inlineKey = null;
  state.settings.modes[viewKey()] = m;
  save();
  renderMain();
  syncHash();
}

// Bookmarkable views: #smart/today, #list/<id or name>/board, #tag/travel/calendar
function syncHash() {
  const defaultMode = ui.vm ? ui.vm.modes[0] : 'list';
  const h = `#${ui.view.type}/${encodeURIComponent(ui.view.id)}${ui.mode !== defaultMode ? '/' + ui.mode : ''}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}
function viewFromHash() {
  const [type, rawId, mode] = location.hash.replace(/^#\/?/, '').split('/');
  if (!type || !rawId) return null;
  const id = decodeURIComponent(rawId);
  if (type === 'smart' && SMART.some(s => s.id === id)) return { type, id, mode };
  if (type === 'tag') return { type, id: id.toLowerCase(), mode };
  if (type === 'list') {
    const l = getList(id) || state.lists.find(x => x.name.toLowerCase() === id.toLowerCase());
    if (l) return { type, id: l.id, mode };
  }
  return null;
}
function applyHash() {
  const v = viewFromHash();
  if (!v) return false;
  const key = `${v.type}:${v.id}`;
  if (key !== viewKey()) navigate(key);
  if (v.mode && MODES[v.mode] && v.mode !== ui.mode) setMode(v.mode);
  return true;
}

function selectTask(id, scroll = true) {
  ui.selectedId = id;
  $$('#content [data-task].selected').forEach(el => el.classList.remove('selected'));
  const el = id && $(`#content [data-task][data-id="${id}"]`);
  if (el) { el.classList.add('selected'); if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
}
function moveSelection(dir) {
  const ids = ui.visibleIds;
  if (!ids.length) return;
  const i = ids.indexOf(ui.selectedId);
  const next = i < 0 ? (dir > 0 ? 0 : ids.length - 1) : clamp(i + dir, 0, ids.length - 1);
  selectTask(ids[next]);
  if (ui.openId) openDetails(ids[next]);
}

function focusQuickAdd() {
  document.body.classList.remove('sidebar-open');
  const i = $('#qaInput');
  i.focus();
  i.scrollIntoView({ block: 'nearest' });
}

/* ---------- Reminders ---------- */
async function askNotifyPermission(force) {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  if (state.settings.notifyAsked && !force) return;
  state.settings.notifyAsked = true;
  save();
  try { await Notification.requestPermission(); } catch { /* ignore */ }
}
function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const t of state.tasks) {
    if (t.done || t.remind == null || !t.due) continue;
    const at = parseYmd(t.due);
    const [h, m] = (t.time || '09:00').split(':').map(Number);
    at.setHours(h, m, 0, 0);
    const fireAt = at.getTime() - t.remind * 60000;
    const key = `${t.due}T${t.time || ''}/${t.remind}`;
    if (now >= fireAt && now - fireAt < 12 * 3600 * 1000 && t.notifiedFor !== key) {
      t.notifiedFor = key;
      changed = true;
      notify(t);
    }
  }
  if (changed) save();
  if (ui.lastDay !== todayStr()) { ui.lastDay = todayStr(); render(); }
}
function notify(t) {
  const body = `${t.time ? fmtTime(t.time) : fmtDate(t.due)}${getList(t.listId) ? ' · ' + getList(t.listId).name : ''}`;
  toast(`⏰ ${trunc(t.title, 50)} — ${body}`, { duration: 12000, action: { label: 'Open', fn: () => openDetails(t.id) } });
  if ('Notification' in window && Notification.permission === 'granted') {
    const opts = { body, icon: 'icon.svg', tag: t.id };
    navigator.serviceWorker?.getRegistration().then(reg => (reg ? reg.showNotification(t.title, opts) : new Notification(t.title, opts))).catch(() => {});
  }
}

/* ---------- Celebration ---------- */
function celebrate() {
  if (REDUCED_MOTION) return;
  const root = document.createElement('div');
  root.className = 'confetti';
  const colors = ['#7b68ee', '#e5484d', '#f5b301', '#1db67f', '#0090ff', '#d6409f'];
  for (let i = 0; i < 90; i++) {
    const s = document.createElement('i');
    s.style.left = Math.random() * 100 + 'vw';
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = Math.random() * 0.4 + 's';
    s.style.animationDuration = 1.4 + Math.random() * 1.2 + 's';
    s.style.setProperty('--dx', Math.random() * 240 - 120 + 'px');
    s.style.setProperty('--r', Math.random() * 900 + 'deg');
    root.appendChild(s);
  }
  document.body.appendChild(root);
  setTimeout(() => root.remove(), 3200);
}

/* ---------- Events ---------- */
async function handleAction(a, el, id) {
  switch (a) {
    case 'toggle': completeWithAnim(id); break;
    case 'star': toggleStar(id); break;
    case 'open':
      if (ui.mode === 'calendar' && el.classList.contains('cal-task')) ui.calDay = getTask(id)?.due || ui.calDay;
      openDetails(id);
      break;
    case 'collapse': { const t = getTask(id); if (t) { t.collapsed = !t.collapsed; save(); renderMain(); } break; }
    case 'due-menu': menuAt(el, dueMenuItems(id, el), false); break;
    case 'prio-menu': menuAt(el, prioMenuItems(id), false); break;
    case 'status-menu': menuAt(el, statusMenuItems(id), false); break;
    case 'group-toggle': {
      const k = `${viewKey()}|${el.dataset.g}`;
      ui.collapsedGroups[k] = !ui.collapsedGroups[k];
      renderMain();
      break;
    }
    case 'inline-add': {
      const key = el.dataset.g;
      if (ui.collapsedGroups[`${viewKey()}|${key}`]) ui.collapsedGroups[`${viewKey()}|${key}`] = false;
      ui.inlineKey = key;
      renderMain();
      $('#content .inline-input')?.scrollIntoView({ block: 'nearest' });
      break;
    }
    case 'new-task': {
      if (ui.mode === 'board') { ui.inlineKey = 'b:todo'; renderMain(); }
      else focusQuickAdd();
      break;
    }
    case 'toggle-completed': {
      const k = viewKey();
      ui.showCompleted[k] = !(ui.showCompleted[k] ?? (ui.view.id === 'today'));
      renderMain();
      break;
    }
    case 'reschedule-overdue': {
      const T = todayStr();
      const items = state.tasks.filter(t => !t.done && !t.parentId && t.due && t.due < T);
      commit(() => items.forEach(t => { t.due = T; t.notifiedFor = null; }), { toast: `Moved ${plural(items.length, 'task')} to today` });
      break;
    }
    case 'clear-completed': {
      const ids = new Set(state.tasks.filter(t => t.done && !t.parentId && t.listId === ui.view.id).map(t => t.id));
      if (!ids.size) { toast('No completed tasks in this list'); break; }
      const ok = await confirmDialog({ title: 'Clear completed tasks?', message: `${plural(ids.size, 'completed task')} will be deleted from this list.`, confirm: 'Clear' });
      if (ok) commit(() => { state.tasks = state.tasks.filter(t => !ids.has(t.id) && !ids.has(t.parentId)); }, { toast: 'Completed tasks cleared' });
      break;
    }
    case 'cal-prev': ui.calMonth = addMonths(ui.calMonth, -1); renderMain(); break;
    case 'cal-next': ui.calMonth = addMonths(ui.calMonth, 1); renderMain(); break;
    case 'cal-today': ui.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); ui.calDay = todayStr(); renderMain(); break;
    case 'cal-space': state.settings.calSpace = el.dataset.space; save(); renderMain(); break;
    case 'cal-layer': {
      const k = el.dataset.layer;
      state.settings.calLayers = { ...(state.settings.calLayers || {}), [k]: !layerOn(k) };
      save();
      renderMain();
      break;
    }
    case 'plan-event': planEvent(el.dataset.ev); break;
    case 'goto-event': {
      const e = findEvent(el.dataset.ev);
      if (!e) break;
      const d = parseYmd(e.d);
      ui.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      ui.calDay = e.d;
      if (ui.vm.modes.includes('calendar')) setMode('calendar'); else navigate('smart:calendar');
      break;
    }
    case 'mode': setMode(el.dataset.mode); break;
    case 'sort':
      menuAt(el, [{ header: 'Sort by' }, ...SORTS.map(s => ({
        label: s.label, checked: sortMode() === s.v,
        action: () => { state.settings.sort[viewKey()] = s.v; save(); renderMain(); },
      }))]);
      break;
    case 'group':
      menuAt(el, [{ header: 'Group by' }, ...GROUPS.filter(g => !(g.v === 'list' && ui.view.type === 'list')).map(g => ({
        label: g.label, checked: groupMode() === g.v,
        action: () => { state.settings.group[viewKey()] = g.v; save(); renderMain(); },
      }))]);
      break;
    case 'view-menu': {
      const items = [];
      if (ui.view.type === 'list') {
        items.push({ label: 'List settings', icon: 'edit', action: () => editList(ui.view.id) });
        items.push({ label: 'Clear completed tasks', icon: 'checkCircle', action: () => handleAction('clear-completed', el) });
        items.push({ sep: true });
      }
      if (ui.vm.groups && ui.vm.groups.some(g => g.key === 'overdue' || g.key === 'd:overdue')) items.push({ label: 'Move overdue to today', icon: 'sun', action: () => handleAction('reschedule-overdue', el) }, { sep: true });
      items.push({ label: 'New list', icon: 'plus', action: () => editList(null) });
      items.push({ label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', action: openShortcuts });
      items.push({ label: 'Settings', icon: 'settings', action: openSettings });
      if (ui.view.type === 'list' && state.lists.length > 1) items.push({ sep: true }, { label: 'Delete list', icon: 'trash', danger: true, action: () => editList(ui.view.id) });
      menuAt(el, items);
      break;
    }
    case 'toggle-sidebar': document.body.classList.toggle('sidebar-open'); break;
    case 'close-sidebar': document.body.classList.remove('sidebar-open'); break;
    case 'add-list': editList(null); break;
    case 'edit-list': editList(el.dataset.list); break;
    case 'settings': openSettings(); break;
    case 'account': openAccount(); break;
    case 'shortcuts': openShortcuts(); break;
    case 'theme': {
      state.settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      save(); applyTheme(); renderSidebar();
      break;
    }
    case 'clear-search': $('#search').value = ''; ui.search = ''; render({ keepDetails: true }); break;
  }
}

function bindEvents() {
  document.addEventListener('click', e => {
    if (e.target.closest('#details, #modalRoot, .menu, .toast')) return;
    const nav = e.target.closest('[data-nav]');
    if (nav) { navigate(nav.dataset.nav); return; }
    const el = e.target.closest('[data-action]');
    if (!el) {
      const cell = e.target.closest('.cal-cell');
      if (cell) { ui.calDay = cell.dataset.date; ui.addDue = null; renderMain(); return; }
      const cardEl = e.target.closest('.card');
      if (cardEl) openDetails(cardEl.dataset.id);
      return;
    }
    const id = el.closest('[data-id]')?.dataset.id;
    if (id && el.dataset.action !== 'open') selectTask(id, false);
    handleAction(el.dataset.action, el, id);
  });

  document.addEventListener('contextmenu', e => {
    const row = e.target.closest('#content [data-task], #content .cal-task');
    if (!row) return;
    e.preventDefault();
    selectTask(row.dataset.id, false);
    taskMenu(row.dataset.id, e.clientX, e.clientY);
  });

  // Long-press for touch devices
  let pressTimer = 0;
  document.addEventListener('touchstart', e => {
    const row = e.target.closest('#content [data-task]');
    if (!row) return;
    const touch = e.touches[0];
    pressTimer = setTimeout(() => { navigator.vibrate?.(10); taskMenu(row.dataset.id, touch.clientX, touch.clientY); }, 520);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach(ev => document.addEventListener(ev, () => clearTimeout(pressTimer), { passive: true }));

  document.addEventListener('mousedown', e => { if (ui.menu && !ui.menu.contains(e.target)) closeMenu(); }, true);
  addEventListener('resize', closeMenu);
  $('#scroller').addEventListener('scroll', closeMenu, { passive: true });

  // Inline "+ Add Task" rows
  const content = $('#content');
  content.addEventListener('keydown', e => {
    const inp = e.target.closest('.inline-input');
    if (!inp) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = inp.value.trim();
      if (!v) return;
      addTaskFromText(v, ui.addTargets[inp.dataset.inline] || {});
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      ui.inlineKey = null;
      renderMain();
    }
  });
  content.addEventListener('focusout', e => {
    const inp = e.target.closest?.('.inline-input');
    if (!inp) return;
    setTimeout(() => {
      if (ui.inlineKey && !document.activeElement?.closest('.inline-input') && !inp.value.trim()) {
        ui.inlineKey = null;
        renderMain();
      }
    }, 150);
  });

  // Quick add
  const qa = $('#qaInput');
  $('#quickAdd').addEventListener('submit', e => {
    e.preventDefault();
    const v = qa.value.trim();
    if (!v) { qa.focus(); return; }
    addTaskFromText(v);
    qa.value = '';
    renderQaPreview();
    qa.focus();
  });
  qa.addEventListener('input', renderQaPreview);
  qa.addEventListener('focus', renderQaPreview);
  qa.addEventListener('blur', () => setTimeout(renderQaPreview, 150));
  qa.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (qa.value) qa.value = '';
      else { ui.addDue = null; qa.blur(); renderQaHint(); }
      renderQaPreview();
    }
  });

  // Search
  const search = $('#search');
  search.addEventListener('input', () => {
    ui.search = search.value.trim();
    ui.selectedId = null;
    render({ keepDetails: true });
  });
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); search.value = ''; ui.search = ''; search.blur(); render({ keepDetails: true }); }
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); search.blur(); document.body.classList.remove('sidebar-open'); moveSelection(1); }
  });

  // Drag & drop
  let drag = null;
  const clearMarks = () => $$('.drop-before, .drop-after, .drop-target').forEach(el => el.classList.remove('drop-before', 'drop-after', 'drop-target'));
  document.addEventListener('dragstart', e => {
    const row = e.target.closest?.('#content [data-task], #content .cal-task');
    if (!row) return;
    drag = { id: row.dataset.id, target: null };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', getTask(drag.id)?.title || '');
    requestAnimationFrame(() => row.classList.add('dragging'));
    document.body.classList.add('is-dragging');
  });
  document.addEventListener('dragend', () => {
    drag = null;
    clearMarks();
    $$('.dragging').forEach(el => el.classList.remove('dragging'));
    document.body.classList.remove('is-dragging');
  });
  document.addEventListener('dragover', e => {
    if (!drag) return;
    clearMarks();
    drag.target = null;
    const nav = e.target.closest('[data-drop-list], [data-drop-smart]');
    if (nav) {
      if (nav.dataset.dropSmart && !['today', 'starred', 'completed', 'upcoming'].includes(nav.dataset.dropSmart)) return;
      e.preventDefault(); nav.classList.add('drop-target'); return;
    }
    const cell = e.target.closest('.cal-cell');
    if (cell) { e.preventDefault(); cell.classList.add('drop-target'); return; }
    const col = e.target.closest('.board-col');
    if (col) { e.preventDefault(); col.classList.add('drop-target'); return; }
    const row = e.target.closest('#content .task[data-task]');
    if (row && row.dataset.id !== drag.id && canReorder()) {
      const r = row.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      row.classList.add(after ? 'drop-after' : 'drop-before');
      drag.target = { id: row.dataset.id, after };
      e.preventDefault();
    }
  });
  document.addEventListener('drop', e => {
    if (!drag) return;
    e.preventDefault();
    const { id, target } = drag;
    const t = getTask(id);
    clearMarks();
    const nav = e.target.closest('[data-drop-list], [data-drop-smart]');
    const cell = e.target.closest('.cal-cell');
    const col = e.target.closest('.board-col');
    if (nav && nav.dataset.dropList) moveToList(id, nav.dataset.dropList);
    else if (nav && nav.dataset.dropSmart) {
      const k = nav.dataset.dropSmart;
      if (k === 'today') setDue(id, todayStr());
      if (k === 'upcoming') setDue(id, ymd(addDays(new Date(), 1)));
      if (k === 'starred' && t && !t.starred) toggleStar(id);
      if (k === 'completed' && t && !t.done) toggleComplete(id);
    } else if (cell) {
      if (t && t.due !== cell.dataset.date) { ui.calDay = cell.dataset.date; setDue(id, cell.dataset.date); }
    } else if (col) {
      if (t && t.status !== col.dataset.status) setStatus(id, col.dataset.status, true);
    } else if (target) reorder(id, target.id, target.after);
    drag = null;
  });

  // Keyboard
  let gPending = 0;
  document.addEventListener('keydown', e => {
    const tgt = e.target instanceof Element ? e.target : document.body;
    const typing = tgt.matches('input, textarea, select, [contenteditable="true"]');
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape') {
      if (ui.menu) { closeMenu(); return; }
      if (modalOpen()) { closeModal(); return; }
      if (typing) { tgt.blur(); return; }
      if (document.body.classList.contains('sidebar-open')) { document.body.classList.remove('sidebar-open'); return; }
      if (ui.openId) { closeDetails(); return; }
      if (ui.search) { handleAction('clear-search'); return; }
      if (ui.selectedId) { selectTask(null); return; }
      return;
    }
    if (mod && e.key.toLowerCase() === 'z' && !typing && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); document.body.classList.add('sidebar-open'); $('#search').focus(); return; }
    if (typing || modalOpen() || mod || e.altKey) return;
    if (ui.menu) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = $$('.menu-item', ui.menu);
        const i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
      return;
    }
    const onButton = tgt.closest('button, a, label');

    if (gPending) {
      clearTimeout(gPending);
      gPending = 0;
      const map = { t: 'today', u: 'upcoming', s: 'starred', a: 'all', c: 'completed' };
      if (map[e.key]) { navigate(`smart:${map[e.key]}`); e.preventDefault(); return; }
      if (/^[1-9]$/.test(e.key) && state.lists[+e.key - 1]) { navigate(`list:${state.lists[+e.key - 1].id}`); e.preventDefault(); return; }
    }

    const sel = ui.selectedId && getTask(ui.selectedId) ? ui.selectedId : null;
    switch (e.key) {
      case 'g': gPending = setTimeout(() => { gPending = 0; }, 1200); return;
      case 'n': case 'q': e.preventDefault(); handleAction('new-task'); return;
      case '/': e.preventDefault(); document.body.classList.add('sidebar-open'); $('#search').focus(); return;
      case '?': e.preventDefault(); openShortcuts(); return;
      case 'v': {
        const ms = ui.vm.modes;
        if (ms.length > 1) setMode(ms[(ms.indexOf(ui.mode) + 1) % ms.length]);
        return;
      }
      case 'j': case 'ArrowDown': e.preventDefault(); moveSelection(1); return;
      case 'k': case 'ArrowUp': e.preventDefault(); moveSelection(-1); return;
    }
    if (!sel) return;
    switch (e.key) {
      case 'x': completeWithAnim(sel); break;
      case ' ': if (onButton) return; e.preventDefault(); completeWithAnim(sel); break;
      case 'Enter': if (onButton) return; e.preventDefault(); openDetails(sel); break;
      case 'e': e.preventDefault(); openDetails(sel); setTimeout(() => $('.d-title')?.focus(), 0); break;
      case 's': toggleStar(sel); break;
      case 't': setDue(sel, todayStr()); break;
      case 'T': setDue(sel, ymd(addDays(new Date(), 1))); break;
      case '1': case '2': case '3': case '4': setPriority(sel, +e.key); break;
      case '0': setPriority(sel, 0); break;
      case ']': shiftStatus(sel, 1); break;
      case '[': shiftStatus(sel, -1); break;
      case 'Delete': case 'Backspace': e.preventDefault(); deleteTask(sel); break;
      case 'Tab': e.preventDefault(); e.shiftKey ? outdent(sel) : indent(sel); break;
      default: return;
    }
  });

  // Keep in sync with other tabs
  addEventListener('storage', e => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try { state = normalize(JSON.parse(e.newValue)); } catch { return; }
    if (ui.openId && !getTask(ui.openId)) ui.openId = null;
    const ae = document.activeElement;
    render({ keepDetails: !!(ae && ae.closest('#details')) });
    afterSave(); // if this tab is the sync leader, upload what the other tab changed
  });

  setInterval(checkReminders, 20000);
  addEventListener('focus', checkReminders);
}

/* ---------- Native app (Android via Capacitor) ---------- */
const Cap = window.Capacitor;
const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const native = isNative ? {
  App: Cap.registerPlugin('App'),
  Notifications: Cap.registerPlugin('LocalNotifications'),
  SystemBars: window.capacitorExports && window.capacitorExports.SystemBars,
} : {};
if (isNative) document.documentElement.classList.add('native');

const notifId = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (Math.abs(h) % 2147483646) + 1; };
let reminderTimer = 0;
// Hands upcoming reminders to Android so they fire even when the app is closed.
function scheduleNativeReminders() {
  if (!native.Notifications) return;
  clearTimeout(reminderTimer);
  reminderTimer = setTimeout(async () => {
    const N = native.Notifications;
    try {
      const now = Date.now();
      const upcoming = [];
      for (const t of state.tasks) {
        if (t.done || t.remind == null || !t.due) continue;
        const at = parseYmd(t.due);
        const [h, m] = (t.time || '09:00').split(':').map(Number);
        at.setHours(h, m, 0, 0);
        const fire = at.getTime() - t.remind * 60000;
        if (fire > now + 5000 && fire < now + 60 * 864e5) upcoming.push({ t, fire });
      }
      upcoming.sort((a, b) => a.fire - b.fire);
      const list = upcoming.slice(0, 60).map(({ t, fire }) => ({
        id: notifId(t.id),
        title: t.title || 'Task reminder',
        body: [t.time ? fmtTime(t.time) : fmtDate(t.due), getList(t.listId) && getList(t.listId).name].filter(Boolean).join(' · '),
        schedule: { at: new Date(fire), allowWhileIdle: true },
        extra: { taskId: t.id },
      }));
      const pending = await N.getPending();
      if (pending.notifications.length) await N.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
      if (!list.length) return;
      let perm = await N.checkPermissions();
      if (perm.display !== 'granted') perm = await N.requestPermissions();
      if (perm.display === 'granted') await N.schedule({ notifications: list });
    } catch (e) { console.warn('Could not schedule reminders', e); }
  }, 1200);
}

function bindNative() {
  if (!isNative) return;
  native.App.addListener('backButton', () => {
    if (ui.menu) return closeMenu();
    if (modalOpen()) return closeModal();
    if (document.body.classList.contains('sidebar-open')) return document.body.classList.remove('sidebar-open');
    if (ui.openId) return closeDetails();
    if (ui.inlineKey) { ui.inlineKey = null; return renderMain(); }
    if (ui.search) return handleAction('clear-search');
    if (viewKey() !== 'smart:today') return navigate('smart:today');
    native.App.minimizeApp();
  });
  native.App.addListener('resume', () => { checkReminders(); if (window.DoableSync) DoableSync.syncNow(); });
  native.Notifications.addListener('localNotificationActionPerformed', ev => {
    const id = ev && ev.notification && ev.notification.extra && ev.notification.extra.taskId;
    if (id && getTask(id)) openDetails(id);
  });
  scheduleNativeReminders();
}

/* ---------- Cloud sync ---------- */
const SYNCED_SETTINGS = ['accent', 'weekStart', 'newOnTop', 'sort', 'group', 'defaultListId', 'calLayers', 'spacesInit'];

// Local state as sync records: one per task and list, plus shared settings and stats.
function syncRecords() {
  const m = new Map();
  state.lists.forEach((l, i) => m.set('list:' + l.id, { kind: 'list', data: { ...listFrom(l), pos: i } }));
  state.tasks.forEach(t => m.set('task:' + t.id, { kind: 'task', data: t }));
  const s = {};
  SYNCED_SETTINGS.forEach(k => { s[k] = state.settings[k] ?? null; });
  m.set('settings', { kind: 'settings', data: s });
  m.set('stats', { kind: 'stats', data: { completions: state.stats.completions } });
  return m;
}

function applyRemote(rows, replace = false) {
  if (replace) { state.tasks = []; state.lists = []; }
  const pos = new Map(state.lists.map((l, i) => [l.id, i]));
  let changed = replace;
  for (const r of rows) {
    const d = r.data || {};
    if (r.kind === 'task') {
      const id = r.id.slice(5);
      const i = state.tasks.findIndex(t => t.id === id);
      if (r.deleted) { if (i >= 0) { state.tasks.splice(i, 1); changed = true; } continue; }
      const t = newTask({ ...d, id, tags: Array.isArray(d.tags) ? d.tags : [] });
      if (!STATUSES.some(s => s.v === t.status)) t.status = t.done ? 'done' : 'todo';
      t.done = t.status === 'done';
      if (i >= 0) state.tasks[i] = t; else state.tasks.push(t);
      changed = true;
    } else if (r.kind === 'list') {
      const id = r.id.slice(5);
      const i = state.lists.findIndex(l => l.id === id);
      if (r.deleted) { if (i >= 0) { state.lists.splice(i, 1); changed = true; } continue; }
      const l = listFrom({ ...d, id });
      pos.set(id, typeof d.pos === 'number' ? d.pos : 1e9);
      if (i >= 0) state.lists[i] = l; else state.lists.push(l);
      changed = true;
    } else if (r.kind === 'settings' && !r.deleted) {
      SYNCED_SETTINGS.forEach(k => { if (d[k] !== undefined && d[k] !== null) state.settings[k] = d[k]; });
      changed = true;
    } else if (r.kind === 'stats' && !r.deleted) {
      const c = state.stats.completions;
      Object.entries(d.completions || {}).forEach(([k, v]) => { c[k] = Math.max(c[k] || 0, Number(v) || 0); });
      changed = true;
    }
  }
  if (!changed) return;
  state.lists.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
  if (!state.lists.length) state.lists.push({ id: uid(), name: 'My Tasks', color: LIST_COLORS[0] });
  if (!getList(state.settings.defaultListId)) state.settings.defaultListId = state.lists[0].id;
  state.meta.pristine = false;
  undoStack.length = 0; // local undo history must not roll back edits made on another device
  if (ui.openId && !getTask(ui.openId)) ui.openId = null;
  if (ui.view.type === 'list' && !getList(ui.view.id)) ui.view = { type: 'smart', id: 'today' };
  save();
  applyTheme();
  const ae = document.activeElement;
  render({ keepDetails: !!(ae && ae.closest('#details')) });
}

function chooseFirstSync() {
  return new Promise(resolve => {
    openModal(`
      <div class="modal-card">
        <h2>Combine your tasks?</h2>
        <p class="muted">Your account already has tasks from another device, and this device has tasks of its own.</p>
        <div class="choices">
          <button class="choice" data-c="merge">${icon('layers')}<span><b>Merge both</b><small>Keep this device's tasks and add everything from your account. Nothing is lost.</small></span></button>
          <button class="choice" data-c="replace">${icon('download')}<span><b>Use my account's tasks</b><small>Replace what's on this device with your synced tasks.</small></span></button>
        </div>
      </div>`, m => {
      m.addEventListener('click', e => {
        const c = e.target.closest('[data-c]');
        if (!c) return;
        modalResolve = null;
        closeModal();
        resolve(c.dataset.c);
      });
    });
    modalResolve = () => resolve('merge'); // dismissing the dialog is the safe choice
  });
}

const SYNC_LABELS = {
  unconfigured: ['off', 'Sync not set up'],
  'signed-out': ['off', 'Sign in to sync'],
  idle: ['busy', 'Connecting…'],
  syncing: ['busy', 'Syncing…'],
  synced: ['ok', 'Synced'],
  offline: ['warn', 'Offline · saved on device'],
  error: ['err', 'Sync paused · retrying'],
};
function syncPill() {
  const S = window.DoableSync;
  if (!S) return '';
  const [cls, label] = SYNC_LABELS[S.status] || SYNC_LABELS.idle;
  const who = S.user && S.user.email;
  return `<button class="sync-pill ${cls}" data-action="account" title="${esc(who ? `${who} · ${label}` : label)}">
    ${who ? `<span class="me-avatar">${esc(initial(who))}</span>` : icon('cloud')}
    <span class="sp-text"><b>${esc(who ? who.split('@')[0] : 'Cloud sync')}</b><span>${esc(label)}</span></span>
    <i class="sp-dot"></i>
  </button>`;
}
function onSyncStatus() {
  renderSidebar();
  const card = $('#modalRoot [data-account]');
  if (card && card.dataset.account === 'in') {
    const st = $('.acct-status', card);
    if (st) st.innerHTML = acctStatusLine();
  } else if (card && card.dataset.account === 'out' && DoableSync.user) openAccount();
  if (!location.hash) syncHash();
}
function acctStatusLine() {
  const S = DoableSync;
  const [cls, label] = SYNC_LABELS[S.status] || SYNC_LABELS.idle;
  const ago = S.lastSync ? relTime(S.lastSync) : '';
  return `<i class="sp-dot ${cls}"></i>${esc(label)}${ago && S.status === 'synced' ? ` · ${esc(ago)}` : ''}${S.error && S.status === 'error' ? `<span class="muted small"> — ${esc(trunc(S.error, 80))}</span>` : ''}`;
}
function relTime(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(ts).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
}

function openAccount(mode = 'signin') {
  const S = window.DoableSync;
  if (!S || !S.configured) {
    openModal(`
      <div class="modal-card" data-account="setup">
        <div class="modal-title-row"><h2>Cloud sync</h2><button class="icon-btn sm" data-m="cancel" aria-label="Close">${icon('x')}</button></div>
        <div class="acct-hero">${icon('cloud')}<p>Sync keeps your tasks identical on every computer and phone you sign in to — instantly, and it still works offline.</p></div>
        <p class="muted small">Sync hasn't been connected for this copy of Doable yet. Whoever hosts it adds a free Supabase project to <code>web/config.js</code> — the step-by-step guide is in <code>SETUP.md</code>.</p>
        <div class="modal-actions"><span class="spacer"></span><button class="btn primary" data-m="cancel">Got it</button></div>
      </div>`);
    return;
  }
  if (S.user) {
    openModal(`
      <div class="modal-card" data-account="in">
        <div class="modal-title-row"><h2>Your account</h2><button class="icon-btn sm" data-m="cancel" aria-label="Close">${icon('x')}</button></div>
        <div class="acct-card">
          <span class="me-avatar lg">${esc(initial(S.user.email))}</span>
          <div class="acct-id"><b>${esc(S.user.email)}</b><span class="acct-status">${acctStatusLine()}</span></div>
        </div>
        <p class="muted small">Changes sync automatically to every device signed in to this account. You can keep working offline — everything uploads when you're back online.</p>
        <div class="modal-actions">
          <button class="btn ghost danger-text" data-a="signout">Sign out</button>
          <span class="spacer"></span>
          <button class="btn ghost" data-a="now">${icon('repeat')}Sync now</button>
        </div>
      </div>`, m => {
      m.addEventListener('click', async e => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'now') { await S.syncNow(); toast(S.status === 'synced' ? 'Everything is up to date' : 'Will retry shortly'); }
        if (a === 'signout') {
          const ok = await confirmDialog({ title: 'Sign out?', message: 'Your tasks stay on this device, but stop syncing until you sign in again.', confirm: 'Sign out', danger: false });
          if (ok) { await S.signOut(); toast('Signed out — tasks kept on this device'); }
        }
      });
    });
    return;
  }
  const signup = mode === 'signup';
  openModal(`
    <form class="modal-card" data-account="out" novalidate>
      <div class="modal-title-row"><h2>${signup ? 'Create your account' : 'Sign in to sync'}</h2><button type="button" class="icon-btn sm" data-m="cancel" aria-label="Close">${icon('x')}</button></div>
      <p class="muted small">${signup ? 'One account keeps your tasks in sync across Chrome, Firefox and the Android app.' : 'Use the same account on every device to keep your tasks in sync.'}</p>
      <div class="seg wide" role="tablist">
        <button type="button" class="${!signup ? 'on' : ''}" data-mode="signin">Sign in</button>
        <button type="button" class="${signup ? 'on' : ''}" data-mode="signup">Create account</button>
      </div>
      <label class="lbl">Email<input name="email" type="email" autocomplete="email" required autofocus placeholder="you@example.com"></label>
      <label class="lbl">Password<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required minlength="6" placeholder="${signup ? 'At least 6 characters' : 'Your password'}"></label>
      <p class="form-msg" role="status" aria-live="polite"></p>
      <div class="modal-actions">
        ${!signup ? '<button type="button" class="link-btn" data-a="forgot">Forgot password?</button>' : ''}
        <span class="spacer"></span>
        <button type="submit" class="btn primary">${signup ? 'Create account' : 'Sign in'}</button>
      </div>
    </form>`, m => {
    const form = m.querySelector('form');
    const msg = m.querySelector('.form-msg');
    const say = (text, kind = 'err') => { msg.textContent = text; msg.className = `form-msg ${kind}`; };
    const btn = form.querySelector('[type="submit"]');
    m.addEventListener('click', async e => {
      const switchTo = e.target.closest('[data-mode]');
      if (switchTo) { openAccount(switchTo.dataset.mode); return; }
      if (e.target.closest('[data-a="forgot"]')) {
        const email = form.email.value.trim();
        if (!email) { say('Enter your email first, then tap “Forgot password?”'); return; }
        const { error } = await S.resetPassword(email);
        say(error ? authError(error) : 'Check your email for a link to set a new password.', error ? 'err' : 'ok');
      }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = form.email.value.trim();
      const password = form.password.value;
      if (!email || !password) { say('Enter your email and password.'); return; }
      btn.disabled = true;
      say(signup ? 'Creating your account…' : 'Signing in…', 'info');
      const { data, error } = signup ? await S.signUp(email, password) : await S.signIn(email, password);
      btn.disabled = false;
      if (error) { say(authError(error)); return; }
      if (signup && !data.session) { say('Almost done — open the confirmation email we sent, then sign in here.', 'ok'); return; }
      closeModal();
      toast('Signed in — syncing your tasks');
    });
  });
}

function authError(err) {
  const m = (err && err.message) || '';
  if (/fetch|network|load failed/i.test(m)) return 'Can’t reach the sync server. Check your internet connection and try again.';
  if (/invalid login credentials/i.test(m)) return 'That email and password don’t match. Try again, or reset your password.';
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first — check your inbox for the link.';
  if (/already registered|already exists/i.test(m)) return 'That email already has an account — switch to Sign in.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a minute and try again.';
  return m || 'Something went wrong — please try again.';
}

function onPasswordRecovery() {
  openModal(`
    <form class="modal-card" data-account="recover">
      <h2>Set a new password</h2>
      <label class="lbl">New password<input name="password" type="password" autocomplete="new-password" minlength="6" required autofocus></label>
      <p class="form-msg" role="status"></p>
      <div class="modal-actions"><span class="spacer"></span><button class="btn primary">Save password</button></div>
    </form>`, m => {
    const form = m.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const { error } = await DoableSync.updatePassword(form.password.value);
      if (error) { const p = m.querySelector('.form-msg'); p.textContent = error.message; p.className = 'form-msg err'; return; }
      closeModal();
      toast('Password updated');
    });
  });
}

/* ---------- Boot ---------- */
const authHash = /access_token=|error_description=|type=recovery/.test(location.hash);
if (authHash) {
  const err = new URLSearchParams(location.hash.slice(1)).get('error_description');
  if (err) setTimeout(() => toast(err.replace(/\+/g, ' ')), 500);
}
applyTheme();
if (ensureSpaces()) save();
bindEvents();
bindDetails();
bindNative();
render();
if (!authHash && !applyHash()) syncHash();
addEventListener('hashchange', applyHash);
checkReminders();
if (window.DoableSync) {
  DoableSync.init({
    records: syncRecords,
    apply: rows => applyRemote(rows),
    replaceAll: rows => applyRemote(rows, true),
    isPristine: () => !!state.meta.pristine,
    chooseFirstSync,
    onSyncStatus,
    onPasswordRecovery,
  });
}

if (!isNative && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
})();
