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
  video: '<path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  lotus: '<path d="M12 20c-2.2-2.2-3.2-5-3.2-8 0-2.6 1.2-5.2 3.2-7.2 2 2 3.2 4.6 3.2 7.2 0 3-1 5.8-3.2 8z"/><path d="M12 20c-4.4 0-8.4-2.4-9-6.6 2.6-.4 5 .4 6.8 2.2M12 20c4.4 0 8.4-2.4 9-6.6-2.6-.4-5 .4-6.8 2.2"/>',
  mapPin: '<path d="M20 10c0 4.99-5.54 10.19-7.4 11.79a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  sunrise: '<path d="M12 2v6M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/>',
  sunset: '<path d="M12 10V2M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M16 6l-4 4-4-4M16 18a4 4 0 0 0-8 0"/>',
  hourglass: '<path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
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
  { id: 'sadhana', name: 'Habits', icon: 'target' },
  { id: 'starred', name: 'Starred', icon: 'star' },
  { id: 'all', name: 'All tasks', icon: 'layers' },
  { id: 'completed', name: 'Completed', icon: 'checkCircle' },
];
const REMINDERS = [
  { v: '', label: 'No reminder' }, { v: 0, label: 'At time of task' }, { v: 5, label: '5 minutes before' },
  { v: 10, label: '10 minutes before' },
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
  'Standup 10am + paste a Meet link',
];

/* ---------- State ---------- */
function newTask(o = {}) {
  return Object.assign({
    id: uid(), listId: null, parentId: null, title: '', notes: '', due: null, time: null, priority: 0,
    status: 'todo', starred: false, tags: [], repeat: null, remind: null, myDay: null, done: false, doneAt: null,
    createdAt: Date.now(), order: 0, collapsed: false, notifiedFor: null,
    type: 'task', link: null, duration: null, // meetings: call link + length in minutes
  }, o);
}

/* ---------- Meetings & call links ---------- */
const CALL_PROVIDERS = [
  { id: 'meet', name: 'Google Meet', color: '#00897b', re: /(^|\.)meet\.google\.com$/ },
  { id: 'zoom', name: 'Zoom', color: '#2d8cff', re: /(^|\.)zoom\.(us|com)$/ },
  { id: 'teams', name: 'Teams', color: '#5b5fc7', re: /(^|\.)teams\.(microsoft|live)\.com$/ },
  { id: 'webex', name: 'Webex', color: '#00a0d1', re: /(^|\.)webex\.com$/ },
  { id: 'jitsi', name: 'Jitsi', color: '#1d76ba', re: /(^|\.)meet\.jit\.si$/ },
  { id: 'whatsapp', name: 'WhatsApp', color: '#25d366', re: /(^|\.)(call\.whatsapp\.com|chat\.whatsapp\.com|wa\.me)$/ },
  { id: 'whereby', name: 'Whereby', color: '#6b4eff', re: /(^|\.)whereby\.com$/ },
  { id: 'discord', name: 'Discord', color: '#5865f2', re: /(^|\.)discord\.(gg|com)$/ },
  { id: 'skype', name: 'Skype', color: '#00aff0', re: /(^|\.)(join\.)?skype\.com$/ },
];
// Only http(s) links are ever opened; anything else (javascript:, data:…) is rejected.
function safeUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  if (!/^[a-z][\w+.-]*:/i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.href;
  } catch { return null; }
}
function callProvider(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return CALL_PROVIDERS.find(p => p.re.test(host)) || { id: 'link', name: 'call', color: '#7b68ee' };
  } catch { return null; }
}
const isCallUrl = url => { const p = callProvider(url); return !!p && p.id !== 'link'; };
const isMeeting = t => t.type === 'meeting';
const meetingMinutes = t => t.duration || 30;
// 'live' from 10 min before start until the end; 'soon' within the next 30 min.
function meetingState(t, now = new Date()) {
  if (!isMeeting(t) || t.done || !t.due || !t.time || t.due !== ymd(now)) return null;
  const [h, m] = t.time.split(':').map(Number);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime();
  const end = start + meetingMinutes(t) * 60000;
  const n = now.getTime();
  if (n >= start - 10 * 60000 && n <= end) return { state: 'live', mins: Math.round((start - n) / 60000), start, end };
  if (n < start && start - n <= 30 * 60000) return { state: 'soon', mins: Math.round((start - n) / 60000), start, end };
  return null;
}
function openLink(url) {
  const safe = safeUrl(url);
  if (!safe) { toast('That link can’t be opened'); return; }
  // In the Android app, navigating hands the link to Android, which opens the Meet/Zoom/Teams app.
  if (isNative) window.location.href = safe;
  else window.open(safe, '_blank', 'noopener,noreferrer');
}
function joinChip(t, compact) {
  if (!t.link || t.done) return '';
  const p = callProvider(t.link) || {};
  const ms = meetingState(t);
  const label = ms && ms.state === 'live' ? 'Join now' : 'Join';
  return `<button class="join-chip ${ms ? ms.state : ''}" data-action="join" style="--pc:${p.color}" title="Join on ${esc(p.name)}: ${esc(t.link)}">${icon('video')}<span>${label}${compact ? '' : ` · ${esc(p.name === 'call' ? 'call' : p.name)}`}</span></button>`;
}

function defaultSettings() {
  return {
    theme: 'system', accent: '#7b68ee', weekStart: 1, newOnTop: true, sort: {}, group: {}, modes: {}, defaultListId: null, lastView: null, notifyAsked: false,
    calLayers: { festivals: true, aol: true, ngo: true }, calSpace: 'all', spacesInit: false,
    location: null, showPanchang: true, // device-only: sunrise/panchang location

  };
}

// The four life areas. Each is backed by a list; some also show a built-in event calendar.
const SPACES = [
  { id: 'personal', name: 'Personal', color: '#30a46c', events: ['birthdays'], aliases: ['personal'] },
  { id: 'work', name: 'Work', color: '#0090ff', aliases: ['work'] },
  { id: 'aol', name: 'Art of Living', color: '#f76b15', events: ['aol', 'moon'], aliases: ['art of living', 'aol'] },
  { id: 'ngo', name: 'NexJyoti NGO', color: '#12a594', events: ['ngo'], aliases: ['nexjyoti ngo', 'nexjyoti', 'ngo'] },
];
const listFrom = l => {
  const out = { id: String(l.id), name: String(l.name || 'Untitled'), color: l.color || LIST_COLORS[0] };
  if (SPACES.some(s => s.id === l.space)) out.space = l.space;
  return out;
};
const spaceOf = list => list && SPACES.find(s => s.id === list.space);
const spaceList = spaceId => state.lists.find(l => l.space === spaceId);

/* ---------- Sadhana: daily practices ---------- */
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_PRACTICES = [
  { id: 'pr-kriya', name: 'Sudarshan Kriya', emoji: '🌬️', color: '#f76b15', days: ALL_DAYS, order: 0 },
  { id: 'pr-meditation', name: 'Meditation', emoji: '🧘', color: '#8b7bd8', days: ALL_DAYS, order: 1 },
  { id: 'pr-yoga', name: 'Yoga · Padmasadhana', emoji: '🤸', color: '#30a46c', days: ALL_DAYS, order: 2 },
  { id: 'pr-satsang', name: 'Satsang', emoji: '🎶', color: '#e2a336', days: [0], order: 3 },
  { id: 'pr-seva', name: 'Seva', emoji: '🙏', color: '#12a594', days: [6], order: 4 },
];
// Habits: "check" (did it / didn't) or "count" (e.g. 8 glasses of water). Sadhana practices are the "sadhana" group.
const HABIT_GROUPS = [
  { id: 'sadhana', name: 'Sadhana', emoji: '🧘' },
  { id: 'health', name: 'Health', emoji: '💪' },
  { id: 'mind', name: 'Mind & learning', emoji: '📖' },
  { id: 'other', name: 'Other', emoji: '✨' },
];
const HABIT_TEMPLATES = [
  { name: 'Drink water', emoji: '💧', group: 'health', type: 'count', target: 8, unit: 'glasses', color: '#0090ff' },
  { name: 'Walk', emoji: '🚶', group: 'health', type: 'count', target: 30, unit: 'min', color: '#30a46c' },
  { name: 'Exercise', emoji: '🏃', group: 'health', type: 'check', color: '#e5484d' },
  { name: 'Sleep by 10:30 PM', emoji: '😴', group: 'health', type: 'check', color: '#6e56cf' },
  { name: 'Eat healthy', emoji: '🥗', group: 'health', type: 'check', color: '#12a594' },
  { name: 'Read', emoji: '📖', group: 'mind', type: 'count', target: 20, unit: 'pages', color: '#e2a336' },
  { name: 'Gratitude journal', emoji: '🙏', group: 'mind', type: 'check', color: '#d6409f' },
  { name: 'No phone after 9 PM', emoji: '📵', group: 'mind', type: 'check', color: '#6f6e77' },
  { name: 'Learn something new', emoji: '💡', group: 'mind', type: 'check', color: '#f76b15' },
  { name: 'Japa', emoji: '📿', group: 'sadhana', type: 'count', target: 4, unit: 'malas', color: '#f76b15' },
  { name: 'Pranayama', emoji: '🌬️', group: 'sadhana', type: 'check', color: '#8b7bd8' },
  { name: 'Read Knowledge Sheet', emoji: '📜', group: 'sadhana', type: 'check', color: '#e2a336' },
];
const practiceFrom = p => (p && p.id ? {
  id: String(p.id), name: String(p.name || 'Habit'), emoji: p.emoji || '✨', color: p.color || '#8b7bd8',
  days: Array.isArray(p.days) && p.days.length ? p.days.map(Number).filter(n => n >= 0 && n <= 6) : [...ALL_DAYS],
  remind: /^\d\d:\d\d$/.test(p.remind || '') ? p.remind : null, order: +p.order || 0, archived: !!p.archived,
  group: HABIT_GROUPS.some(g => g.id === p.group) ? p.group : 'sadhana',
  type: p.type === 'count' ? 'count' : 'check',
  target: Math.max(1, Math.min(9999, Math.round(+p.target || 1))),
  unit: String(p.unit || '').slice(0, 20),
} : null);
// Default practices once per account (deterministic ids, so two devices don't create duplicates)
function ensureSadhana() {
  if (state.settings.sadhanaInit) return false;
  if (!state.practices.length) state.practices = DEFAULT_PRACTICES.map(practiceFrom);
  state.settings.sadhanaInit = true;
  return true;
}

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
  settings.sadhanaInit = true;
  return {
    version: 2, lists: [inbox, personal, work, aol, ngo], tasks, settings, stats: { completions: { [todayStr()]: 1 } }, meta: { pristine: true },
    practices: DEFAULT_PRACTICES.map(practiceFrom), sadhana: {}, people: [],
  };
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
    practices: Array.isArray(data.practices) ? data.practices.map(practiceFrom).filter(Boolean) : [],
    sadhana: data.sadhana && typeof data.sadhana === 'object' ? data.sadhana : {},
    people: Array.isArray(data.people) ? data.people.filter(p => p && p.id) : [],
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
  updateWidget();
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
function endTime(t) {
  const [h, m] = t.time.split(':').map(Number);
  const e = h * 60 + m + meetingMinutes(t);
  return `${String(Math.floor(e / 60) % 24).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`;
}
const fmtDue = t => (t.due ? fmtDate(t.due) : '') + (t.time ? ` ${fmtTime(t.time)}${isMeeting(t) ? '–' + fmtTime(endTime(t)) : ''}` : '');
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
  // A pasted call link makes it a meeting; any other link goes into the notes.
  const url = p.url && safeUrl(p.url);
  if (url && isCallUrl(url)) Object.assign(task, { type: 'meeting', link: url, duration: 30, remind: task.time ? 10 : null });
  else if (url) task.notes = url;
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
        calTasks: top.filter(t => t.due), banner: (eventsByDate(T, T)[T] || []).filter(e => !e.personId), upNext: upNextMeetings(), panchang: T,
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
    case 'sadhana': {
      const due = activePractices().filter(p => scheduledOn(p, T));
      const done = due.filter(p => isDone(T, p.id)).length;
      return {
        title: 'Habits', icon: 'target', modes: ['list'], groups: [], completed: [], sortable: false, sadhana: true,
        subtitle: due.length ? `${done} of ${due.length} done today` : 'Sadhana, health and everyday habits',
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
  eventYears.clear(); // birthdays etc. may have changed (undo, sync, other tabs); rebuilding is cheap
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
    sadhana: activePractices().filter(p => scheduledOn(p, T) && !isDone(T, p.id)).length,
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
    const set = sp && sp.events && EVENT_SETS[sp.events[0]];
    return `
    <div class="nav-row">
      <button class="nav-item ${cur === 'list:' + l.id ? 'active' : ''}" data-nav="list:${l.id}" data-drop-list="${l.id}">
        ${avatar(l.name, l.color, 'sm')}
        <span class="nav-label"><span class="nl-text">${esc(l.name)}</span>${set ? `<span class="nav-emoji" title="Includes ${esc(set.name)} calendar">${set.emoji}</span>` : ''}</span>
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
  content.innerHTML = vm.sadhana ? renderSadhana() : ui.mode === 'calendar' ? renderCalendar(vm) : ui.mode === 'board' ? renderBoard(vm) : renderList(vm);
  $('.content-wrap').classList.toggle('no-qa', !!vm.sadhana);
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
  const sets = sp && sp.events ? sp.events.filter(layerOn) : [];
  if (!sets.length) return null;
  const T = todayStr();
  const map = eventsByDate(T, ymd(addDays(new Date(), 60)), sets);
  const evs = Object.keys(map).sort().flatMap(d => map[d]).slice(0, 4);
  return evs.length ? evs : null;
}

function eventStrip(title, evs, withDates) {
  return `<section class="event-strip">
    <header>${esc(title)}</header>
    <div class="es-items">${evs.map(e => `<button class="es-item" data-action="goto-event" data-ev="${e.id}" style="--ec:${setOf(e).color}">
      <span class="es-emoji">${emojiOf(e)}</span>
      <span class="es-text"><b>${esc(e.t)}</b>${withDates ? `<span>${esc(fmtDate(e.d))}${e.time ? ' · ' + esc(fmtTime(e.time)) : ''}</span>` : e.k === 'holiday' ? '<span>Public holiday</span>' : `<span>${esc(setOf(e).name)}</span>`}</span>
    </button>`).join('')}</div>
  </section>`;
}

// Meetings that are about to start or happening now, soonest first.
function upNextMeetings() {
  const now = new Date();
  return state.tasks.map(t => ({ t, ms: meetingState(t, now) })).filter(x => x.ms).sort((a, b) => a.ms.start - b.ms.start);
}
function upNextBanner(list) {
  return list.map(({ t, ms }) => {
    const prov = t.link ? callProvider(t.link) : null;
    const status = ms.state === 'live' ? (ms.mins > 0 ? `Starts in ${ms.mins} min` : 'Happening now') : `Starts in ${ms.mins} min`;
    return `<div class="up-next ${ms.state}" data-id="${t.id}" style="--pc:${prov ? prov.color : 'var(--accent)'}">
      <span class="un-ico">${icon('video')}</span>
      <div class="un-main" data-action="open"><b>${esc(t.title || 'Meeting')}</b><span>${esc(status)} · ${esc(fmtTime(t.time))}–${esc(fmtTime(endTime(t)))}${prov && prov.id !== 'link' ? ' · ' + esc(prov.name) : ''}</span></div>
      ${t.link ? `<button class="btn primary sm" data-action="join">${icon('video')}${ms.state === 'live' ? 'Join now' : 'Join'}</button>` : `<button class="btn ghost sm" data-action="open">Add link</button>`}
    </div>`;
  }).join('');
}

function renderList(vm) {
  const hasActive = vm.groups.some(g => g.tasks.length);
  let html = '';
  if (vm.upNext && vm.upNext.length) html += upNextBanner(vm.upNext);
  if (vm.panchang) html += birthdayStrip(vm.panchang) + panchangStrip(vm.panchang) + sadhanaStrip();
  if (vm.list && vm.list.space === 'personal') {
    html += `<div class="pp-bar"><span>🎂 ${state.people.length ? `${peopleCount(state.people.length)} with birthdays & anniversaries` : 'Never miss a birthday — add them or import from Google Contacts'}</span><button class="btn ghost sm" data-action="people">${state.people.length ? 'Manage' : 'Add birthdays'}</button></div>`;
  }
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
  if (t.link && !t.done) meta.push(joinChip(t));
  else if (isMeeting(t)) meta.push(`<span class="chip">${icon('video')}Meeting</span>`);
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
  if (t.link && !t.done) meta.unshift(joinChip(t, true));
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
const eventYears = new Map(); // cleared when the location changes (moon days depend on it)
const clock = date => date.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
const clockOn = (date, day) => clock(date) + (ymd(date) !== day ? ` (${fmtShort(ymd(date))})` : '');
function eventsForYear(y) {
  if (eventYears.has(y)) return eventYears.get(y);
  const out = [];
  const fest = FESTIVALS.filter(f => f.d.startsWith(y + '-'));
  const sacredRe = EVENT_SETS.aol && EVENT_SETS.aol.sacred;
  fest.forEach(f => out.push({ set: 'festivals', d: f.d, t: f.t, k: f.k, tentative: !!f.tentative, sacred: !!(sacredRe && sacredRe.test(f.t)) }));
  for (const [setId, set] of Object.entries(EVENT_SETS)) {
    if (setId === 'festivals') continue;
    if (set.fromPeople) {
      for (const p of state.people) {
        for (const kind of ['birthday', 'anniversary']) {
          const date = p[kind];
          if (!date) continue;
          const [yy, mm, dd] = date.replace(/^--/, '0000-').split('-').map(Number);
          // Feb 29 falls on Feb 28 in other years
          const day = mm === 2 && dd === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 28 : dd;
          const years = yy ? y - yy : null;
          if (years !== null && years < 0) continue;
          const first = p.name.split(/\s+/)[0];
          out.push({
            set: setId, d: `${y}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`, k: kind, personId: p.id,
            emoji: kind === 'birthday' ? '🎂' : '💐',
            t: kind === 'birthday' ? `${p.name}'s birthday${years ? ` (turns ${years})` : ''}` : `${p.name} · anniversary${years ? ` (${years} yrs)` : ''}`,
            note: p.phone ? `Wish ${first} on WhatsApp.` : `Tap Wish to send ${first} a message.`,
          });
        }
      }
      continue;
    }
    if (set.moonPhases && window.Panchang) {
      const nearFest = (re, d, offset = 0) => fest.find(f => re.test(f.t) && f.d === ymd(addDays(parseYmd(d), offset)));
      const aolPurnimaDays = new Set(((EVENT_SETS.aol || {}).dated || []).filter(e => /Purnima/.test(e.t)).map(e => e.d));
      for (const p of Panchang.phases(y)) {
        const base = set[p.type];
        const named = (set.names || []).find(n => n.type === p.type && nearFest(n.match, p.d, n.offset || 0));
        // Guru Purnima is already on the Art of Living calendar; the day is still marked as a full moon
        if (p.type === 'full' && aolPurnimaDays.has(p.d) && !named) { out.push({ set: setId, d: p.d, t: 'Full moon', k: 'moon-full', hidden: true }); continue; }
        out.push({
          set: setId, d: p.d, k: p.type === 'full' ? 'moon-full' : 'moon-new', emoji: p.type === 'full' ? '🌕' : '🌑',
          t: named ? named.t : base.t,
          note: (named && named.note ? named.note + ' ' : '') + base.note.replace('{time}', clockOn(p.utc, p.d)),
        });
      }
      // Ekadashi, Pradosh, Masik Shivaratri
      for (const s of Panchang.specialDays(y)) {
        if (s.kind === 'shivaratri' && fest.some(f => f.t === 'Maha Shivaratri' && f.d === s.d)) continue;
        const conf = (set.special || {})[s.kind];
        if (!conf) continue;
        const info = Panchang.dayInfo(s.d);
        out.push({
          set: setId, d: s.d, k: 'vrat', emoji: conf.emoji, t: conf.t.replace('{paksha}', s.paksha),
          note: conf.note.replace('{until}', clockOn(info.tithi.endsAt, s.d)).replace('{sunset}', clock(info.sunset)),
        });
      }
      continue;
    }
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
const emojiOf = e => e.emoji || setOf(e).emoji;
// Moon phase per day for highlighting cells (includes days whose moon event is merged into another event)
function moonDays(from, to) {
  const map = {};
  if (!eventScope().includes('moon') || !layerOn('moon')) return map;
  for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
    for (const e of eventsForYear(y)) if (e.set === 'moon' && e.d >= from && e.d <= to) map[e.d] = e.k;
  }
  return map;
}
// Sacred festivals are highlighted wherever the Art of Living calendar is in view
const sacredOn = () => eventScope().includes('aol') && layerOn('aol');

/* ---------- Location (sunrise, sunset & panchang) ---------- */
const DEFAULT_LOCATION = { name: 'Art of Living International Center', region: 'Bengaluru', lat: 12.83, lon: 77.51, source: 'default' };
const currentLocation = () => state.settings.location || DEFAULT_LOCATION;
const CITIES = (window.DOABLE_CITIES || []).map(([name, region, lat, lon]) => ({ name, region, lat, lon }));
function distanceKm(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
function nearestCity(lat, lon) {
  let best = null;
  for (const c of CITIES) { const km = distanceKm({ lat, lon }, c); if (!best || km < best.km) best = { ...c, km }; }
  return best;
}
function applyLocation() {
  if (window.Panchang) Panchang.setLocation(currentLocation());
  eventYears.clear();
}
function setLocation(l, { quiet } = {}) {
  // ~1 km precision is plenty for sunrise times and keeps the exact position private
  state.settings.location = { ...l, lat: Math.round(l.lat * 100) / 100, lon: Math.round(l.lon * 100) / 100 };
  save();
  applyLocation();
  render({ keepDetails: true });
  if (!quiet) toast(`Sunrise & panchang set for ${l.name}`);
}
function locateMe({ quiet } = {}) {
  if (!navigator.geolocation) { if (!quiet) toast('Location isn’t available here — pick your city instead'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    const near = nearestCity(lat, lon);
    const cur = currentLocation();
    if (quiet && cur.source === 'gps' && distanceKm(cur, { lat, lon }) < 25) return; // hasn't moved
    const name = !near ? 'Current location' : near.km < 30 ? near.name : `Near ${near.name}`;
    closeModal();
    setLocation({ name, region: near && near.region, lat, lon, source: 'gps' }, { quiet: false });
  }, err => {
    if (!quiet) toast(err.code === 1 ? 'Location permission was declined — pick your city instead' : 'Couldn’t get your location — pick your city instead');
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600000 });
}
// If you chose "use my location" before, quietly follow you to a new city when the app opens
function refreshLocationIfAllowed() {
  if (currentLocation().source !== 'gps' || !navigator.permissions) return;
  navigator.permissions.query({ name: 'geolocation' }).then(p => { if (p.state === 'granted') locateMe({ quiet: true }); }).catch(() => {});
}

function openLocationPicker() {
  const cur = currentLocation();
  openModal(`
    <div class="modal-card loc-card">
      <div class="modal-title-row"><h2>Your location</h2><button class="icon-btn sm" data-m="cancel" aria-label="Close">${icon('x')}</button></div>
      <p class="muted small">Used for sunrise, sunset, Rahu Kaal and the tithi of each day. It stays on this device.</p>
      <div class="loc-current">${icon('mapPin')}<div><b>${esc(cur.name)}</b><span>${esc([cur.region, cur.source === 'gps' ? 'from your device' : cur.source === 'default' ? 'default' : ''].filter(Boolean).join(' · '))}</span></div></div>
      <button class="btn primary loc-gps" data-act="gps">${icon('mapPin')}Use my current location</button>
      <label class="lbl">Or choose a city<input class="loc-search" type="search" placeholder="Search city…" autocomplete="off" autofocus></label>
      <div class="loc-results" role="listbox"></div>
    </div>`, m => {
    const input = m.querySelector('.loc-search');
    const box = m.querySelector('.loc-results');
    const show = () => {
      const q = input.value.trim().toLowerCase();
      const list = (q ? CITIES.filter(c => `${c.name} ${c.region}`.toLowerCase().includes(q)) : CITIES.slice(0, 12)).slice(0, 40);
      box.innerHTML = list.length
        ? list.map((c, i) => `<button class="loc-item" data-i="${CITIES.indexOf(c)}" role="option">${esc(c.name)}<span>${esc(c.region)}</span></button>`).join('')
        : '<p class="muted small pad">No match — try a nearby bigger city.</p>';
    };
    input.addEventListener('input', show);
    show();
    m.addEventListener('click', e => {
      if (e.target.closest('[data-act="gps"]')) { locateMe(); return; }
      const b = e.target.closest('.loc-item');
      if (!b) return;
      const c = CITIES[+b.dataset.i];
      closeModal();
      setLocation({ ...c, source: 'city' });
    });
  });
}

/* ---------- Sadhana tracker UI ---------- */
const activePractices = () => state.practices.filter(p => !p.archived).sort((a, b) => (HABIT_GROUPS.findIndex(g => g.id === a.group) - HABIT_GROUPS.findIndex(g => g.id === b.group)) || a.order - b.order);
const scheduledOn = (p, day) => p.days.includes(parseYmd(day).getDay());
const logOf = (day, pid) => state.sadhana[day] && state.sadhana[day][pid];
const isDone = (day, pid) => { const l = logOf(day, pid); return !!l && l.done !== false; };
// Count habits: how far along today (check habits are 0 or 1)
const countOf = (day, p) => { const l = logOf(day, p.id); return !l ? 0 : typeof l.count === 'number' ? l.count : l.done !== false ? p.target : 0; };
const progressOf = (day, p) => (p.type === 'count' ? Math.min(1, countOf(day, p) / p.target) : isDone(day, p.id) ? 1 : 0);
const habitStep = p => (p.target <= 12 ? 1 : Math.round(p.target / 4));
const habitGroupFilter = () => state.settings.habitGroup || 'all';
const dayBefore = d => ymd(addDays(parseYmd(d), -1));
const firstLogDay = () => Object.keys(state.sadhana).sort()[0] || todayStr();

// Current & best streaks. Unscheduled days never break a streak; today doesn't count against you until it's over.
function streakOf(p) {
  const T = todayStr();
  const first = firstLogDay();
  let current = 0;
  for (let d = isDone(T, p.id) ? T : dayBefore(T); d >= first; d = dayBefore(d)) {
    if (isDone(d, p.id)) current++;
    else if (scheduledOn(p, d)) break;
  }
  let best = 0, run = 0;
  for (let d = first; d <= T; d = ymd(addDays(parseYmd(d), 1))) {
    if (isDone(d, p.id)) best = Math.max(best, ++run);
    else if (scheduledOn(p, d) && d !== T) run = 0;
  }
  return { current, best: Math.max(best, current) };
}
function monthRate(p) {
  const T = todayStr();
  let due = 0, done = 0;
  for (let d = T.slice(0, 8) + '01'; d <= T; d = ymd(addDays(parseYmd(d), 1))) {
    const did = isDone(d, p.id);
    if (scheduledOn(p, d) && (d !== T || did)) due++;
    if (did) done++;
  }
  return due ? Math.min(100, Math.round((done / due) * 100)) : null;
}
// Sacred-day nudge for practice, from the moon/festival calendars
function sadhanaHint(day) {
  const evs = eventsByDate(day, day, ['moon', 'festivals', 'aol'])[day] || [];
  const moon = evs.find(e => e.k === 'moon-full' || e.k === 'moon-new');
  const ek = evs.find(e => e.k === 'vrat' && /Ekadashi/.test(e.t));
  const sacred = evs.find(e => e.sacred || e.set === 'aol');
  if (moon && moon.k === 'moon-full') return `🌕 ${moon.t.split(' · ')[0]} today — a beautiful day for a longer meditation.`;
  if (moon) return '🌑 Amavasya today — go within: silence and deep meditation.';
  if (ek) return '🪷 Ekadashi today — eat light and give more time to meditation.';
  if (sacred) return `✨ ${sacred.t} — a sacred day for sadhana and satsang.`;
  return '';
}

/* ---------- Birthdays & anniversaries ---------- */
// Dates are stored as YYYY-MM-DD, or --MM-DD when the year isn't known.
function normBday(raw) {
  const s = String(raw || '').trim();
  let m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (m) return +m[1] <= 1604 ? `--${m[2]}-${m[3]}` : `${m[1]}-${m[2]}-${m[3]}`; // 1604 = Apple's "no year"
  m = s.match(/^--(\d{2})-?(\d{2})/);
  if (m) return `--${m[1]}-${m[2]}`;
  return null;
}
const validBday = d => { const m = d && d.match(/(\d{2})-(\d{2})$/); return !!m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31; };
const bdayLabel = d => {
  const [yy, mm, dd] = d.replace(/^--/, '0000-').split('-').map(Number);
  return new Date(2000, mm - 1, dd).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }) + (yy ? ` ${yy}` : '');
};
function nextOccurrence(d) {
  const [, mm, dd] = d.replace(/^--/, '0000-').split('-').map(Number);
  const now = startOfDay(new Date());
  let next = new Date(now.getFullYear(), mm - 1, dd);
  if (next < now) next = new Date(now.getFullYear() + 1, mm - 1, dd);
  return Math.round((next - now) / 864e5);
}
const peopleChanged = () => { eventYears.clear(); };
const peopleCount = n => (n === 1 ? '1 person' : `${n} people`);
// WhatsApp link with a ready greeting. Assumes India (+91) for bare 10-digit mobile numbers.
function wishUrl(person, kind) {
  const first = person.name.split(/\s+/)[0];
  const text = kind === 'anniversary' ? `Happy anniversary, ${first}! 💐 Wishing you both many more happy years.` : `Happy birthday, ${first}! 🎉 Wishing you a wonderful year ahead.`;
  let digits = String(person.phone || '').replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = '91' + digits;
  if (digits.length === 11 && digits.startsWith('0')) digits = '91' + digits.slice(1);
  return `https://wa.me/${digits.length >= 10 ? digits : ''}?text=${encodeURIComponent(text)}`;
}

function birthdayStrip(day) {
  const evs = (eventsByDate(day, day, ['birthdays'])[day] || []);
  if (!evs.length) return '';
  return `<section class="bd-strip">${evs.map(e => `
    <div class="bd-item">
      <span class="bd-emoji">${e.emoji}</span>
      <span class="bd-text"><b>${esc(e.t)}</b><span>${e.k === 'birthday' ? 'Birthday today' : 'Anniversary today'}</span></span>
      <button class="btn primary sm wish-btn" data-action="wish" data-person="${e.personId}" data-kind="${e.k}">${icon('sparkles')}Wish on WhatsApp</button>
    </div>`).join('')}</section>`;
}

// vCard (.vcf) — Google Contacts "Export → vCard", iPhone, Outlook
function parseVcf(text) {
  const out = [];
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  for (const card of unfolded.split(/BEGIN:VCARD/i).slice(1)) {
    const lines = card.split('\n');
    const val = l => l.slice(l.indexOf(':') + 1).trim().replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ');
    const find = re => lines.find(l => re.test(l));
    let name = (find(/^FN[;:]/i) && val(find(/^FN[;:]/i))) || '';
    if (!name && find(/^N[;:]/i)) { const [last, given] = val(find(/^N[;:]/i)).split(';'); name = [given, last].filter(Boolean).join(' '); }
    const bday = find(/^BDAY[;:]/i) && normBday(val(find(/^BDAY[;:]/i)));
    let anniv = find(/^(X-)?ANNIVERSARY[;:]/i) && normBday(val(find(/^(X-)?ANNIVERSARY[;:]/i)));
    if (!anniv) { // Apple/Google style: itemN.X-ABDATE + itemN.X-ABLabel:...Anniversary...
      const label = find(/^item\d+\.X-ABLabel:.*anniversary/i);
      if (label) { const item = label.split('.')[0]; const dl = lines.find(l => l.toLowerCase().startsWith(item.toLowerCase() + '.x-abdate')); if (dl) anniv = normBday(val(dl)); }
    }
    const tel = find(/^TEL[^:]*CELL/i) || find(/^TEL[;:]/i);
    if (name && (bday || anniv)) out.push({ name, birthday: bday || null, anniversary: anniv || null, phone: tel ? val(tel).replace(/[^\d+]/g, '') : null });
  }
  return out;
}
// Google Contacts "Export → Google CSV" (old and new column names)
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim().replace(/^﻿/, ''));
  const col = name => head.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const out = [];
  for (const r of rows) {
    const get = n => { const i = col(n); return i >= 0 ? (r[i] || '').trim() : ''; };
    const name = get('Name') || [get('First Name') || get('Given Name'), get('Middle Name') || get('Additional Name'), get('Last Name') || get('Family Name')].filter(Boolean).join(' ');
    const bday = normBday(get('Birthday'));
    let anniv = null;
    for (let n = 1; n <= 5 && !anniv; n++) {
      const type = get(`Event ${n} - Label`) || get(`Event ${n} - Type`);
      if (/anniversary/i.test(type)) anniv = normBday(get(`Event ${n} - Value`));
    }
    const phone = (get('Phone 1 - Value').split(':::')[0] || '').replace(/[^\d+]/g, '') || null;
    if (name && (bday || anniv)) out.push({ name, birthday: bday, anniversary: anniv, phone });
  }
  return out;
}

function importContacts(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    const found = /BEGIN:VCARD/i.test(text) ? parseVcf(text) : parseCsv(text);
    if (!found.length) { toast('No birthdays or anniversaries found in that file'); return; }
    const key = p => `${p.name.toLowerCase()}|${p.birthday || ''}|${p.anniversary || ''}`;
    const have = new Set(state.people.map(key));
    const fresh = found.filter(p => !have.has(key(p)) && (validBday(p.birthday) || validBday(p.anniversary)));
    commit(() => { fresh.forEach(p => state.people.push({ id: uid(), ...p, source: 'contacts' })); peopleChanged(); });
    toast(`Imported ${peopleCount(fresh.length)}${found.length - fresh.length ? ` · ${found.length - fresh.length} already here` : ''}`, { undo: true });
    openPeopleManager();
  };
  reader.readAsText(file);
}

function openPeopleManager(editId) {
  const people = [...state.people].sort((a, b) => Math.min(...[a.birthday, a.anniversary].filter(Boolean).map(nextOccurrence)) - Math.min(...[b.birthday, b.anniversary].filter(Boolean).map(nextOccurrence)));
  const editing = editId && state.people.find(p => p.id === editId);
  const f = editing || {};
  const dateVal = d => (d && !d.startsWith('--') ? d : d ? `2000-${d.slice(2)}` : '');
  openModal(`
    <div class="modal-card wide people-card">
      <div class="modal-title-row"><h2>🎂 Birthdays & anniversaries</h2><button class="icon-btn sm" data-m="cancel" aria-label="Close">${icon('x')}</button></div>
      <form class="pp-form" autocomplete="off">
        <input name="name" placeholder="Name" value="${esc(f.name || '')}" required aria-label="Name">
        <label>🎂<input name="birthday" type="date" value="${dateVal(f.birthday)}" aria-label="Birthday"></label>
        <label class="pp-noyear"><input name="noyear" type="checkbox" ${f.birthday && f.birthday.startsWith('--') ? 'checked' : ''}> Year unknown</label>
        <label>💐<input name="anniversary" type="date" value="${dateVal(f.anniversary)}" aria-label="Anniversary"></label>
        <input name="phone" type="tel" placeholder="WhatsApp number (optional)" value="${esc(f.phone || '')}" aria-label="Phone">
        <button class="btn primary sm" type="submit">${editing ? 'Save' : `${icon('plus')}Add`}</button>
        ${editing ? '<button class="btn ghost sm" type="button" data-pp="cancel-edit">Cancel</button>' : ''}
      </form>
      <div class="pp-import">
        <div><b>Import from Google Contacts</b><span class="muted small">On <a href="https://contacts.google.com" target="_blank" rel="noopener">contacts.google.com</a> choose <b>Export → vCard</b> (or Google CSV), then pick the file here. Only names, birthdays, anniversaries and the first phone number are kept.</span></div>
        <label class="btn ghost sm">${icon('upload')}Choose file<input type="file" accept=".vcf,.csv,text/vcard,text/csv" data-pp="import" hidden></label>
      </div>
      <div class="pp-list">${people.length ? people.map(p => {
        const next = Math.min(...[p.birthday, p.anniversary].filter(Boolean).map(nextOccurrence));
        return `<div class="pp-row" data-person="${p.id}">
          <span class="pp-avatar">${esc(initial(p.name))}</span>
          <div class="pp-main"><b>${esc(p.name)}</b><span>${[p.birthday && `🎂 ${bdayLabel(p.birthday)}`, p.anniversary && `💐 ${bdayLabel(p.anniversary)}`, p.phone && `📱 ${p.phone}`].filter(Boolean).map(esc).join(' · ')}</span></div>
          <span class="pp-next ${next === 0 ? 'today' : ''}">${next === 0 ? 'Today' : next === 1 ? 'Tomorrow' : `in ${next} days`}</span>
          <button class="icon-btn sm" data-pp="edit" title="Edit" aria-label="Edit">${icon('edit')}</button>
          <button class="icon-btn sm danger" data-pp="delete" title="Remove" aria-label="Remove">${icon('trash')}</button>
        </div>`;
      }).join('') : '<p class="muted small pad">No one yet — add a birthday above or import your contacts.</p>'}</div>
    </div>`, m => {
    const form = m.querySelector('.pp-form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const name = String(fd.get('name')).trim();
      const b = String(fd.get('birthday') || '');
      const a = String(fd.get('anniversary') || '');
      if (!name || (!b && !a)) { toast('Add a name and a birthday or anniversary'); return; }
      const birthday = b ? (fd.get('noyear') ? `--${b.slice(5)}` : b) : null;
      const person = { id: editing ? editing.id : uid(), name, birthday, anniversary: a || null, phone: String(fd.get('phone') || '').trim() || null, source: editing ? editing.source : 'manual' };
      commit(() => {
        const i = state.people.findIndex(p => p.id === person.id);
        if (i >= 0) state.people[i] = person; else state.people.push(person);
        peopleChanged();
      });
      openPeopleManager();
    });
    m.addEventListener('click', async e => {
      const act = e.target.closest('[data-pp]')?.dataset.pp;
      const id = e.target.closest('[data-person]')?.dataset.person;
      if (act === 'edit') openPeopleManager(id);
      if (act === 'cancel-edit') openPeopleManager();
      if (act === 'delete') {
        const p = state.people.find(x => x.id === id);
        commit(() => { state.people = state.people.filter(x => x.id !== id); peopleChanged(); }, { toast: `Removed ${p.name}` });
        openPeopleManager();
      }
    });
    m.addEventListener('change', e => { if (e.target.dataset.pp === 'import' && e.target.files[0]) importContacts(e.target.files[0]); });
    if (editing) setTimeout(() => form.name.focus(), 0);
  });
}

function habitValueLabel(p, day) {
  if (p.type !== 'count') return '';
  return `${countOf(day, p)}/${p.target}${p.unit ? ' ' + p.unit : ''}`;
}

function sadhanaStrip() {
  if (state.settings.showSadhana === false) return '';
  const T = todayStr();
  const list = activePractices().filter(p => scheduledOn(p, T));
  if (!list.length) return '';
  const done = list.filter(p => isDone(T, p.id)).length;
  const hint = list.some(p => p.group === 'sadhana') ? sadhanaHint(T) : '';
  return `<section class="sd-strip">
    <header><span>${icon('target')}Habits</span><b>${done}/${list.length}</b>${hint ? `<em>${esc(hint)}</em>` : ''}<button class="link-btn" data-nav="smart:sadhana">Open ${icon('chevronRight')}</button></header>
    <div class="sd-chips">${list.map(p => {
      const on = isDone(T, p.id);
      const s = on ? streakOf(p).current : 0;
      const count = p.type === 'count';
      const pct = Math.round(progressOf(T, p) * 100);
      return `<button class="sd-chip ${on ? 'done' : ''} ${count ? 'hb-count' : ''}" data-action="${count && !on ? 'sd-inc' : 'sd-toggle'}" data-p="${p.id}" style="--pc:${p.color};--pct:${pct}%" aria-pressed="${on}" title="${count ? (on ? 'Done — tap to reset' : `Tap to add ${habitStep(p)}`) : ''}">
        <span class="sd-emo">${p.emoji}</span><span>${esc(p.name)}</span>${count ? `<small class="sd-count">${esc(habitValueLabel(p, T))}</small>` : ''}${on ? `<span class="sd-tick">${icon('check')}</span>${s > 1 ? `<small>🔥${s}</small>` : ''}` : ''}
      </button>`;
    }).join('')}</div>
  </section>`;
}

function heatmap(weeks = 26, ps = activePractices()) {
  const T = todayStr();
  const ws = state.settings.weekStart;
  const today = parseYmd(T);
  const end = addDays(today, (ws + 6 - today.getDay() + 7) % 7); // end of this week
  const start = addDays(end, -(weeks * 7 - 1));
  let cells = '', months = '';
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const colStart = addDays(start, w * 7);
    if (colStart.getMonth() !== lastMonth) { lastMonth = colStart.getMonth(); months += `<span style="grid-column:${w + 1}">${colStart.toLocaleDateString(LOCALE, { month: 'short' })}</span>`; }
    for (let r = 0; r < 7; r++) {
      const d = ymd(addDays(colStart, r));
      const due = ps.filter(p => scheduledOn(p, d));
      const score = ps.reduce((s, p) => s + progressOf(d, p), 0);
      const level = d > T ? -1 : score === 0 ? 0 : !due.length ? 4 : Math.max(1, Math.min(4, Math.ceil((score / due.length) * 4)));
      const did = ps.filter(p => isDone(d, p.id)).length;
      cells += `<i class="hm l${level}" style="grid-column:${w + 1};grid-row:${r + 1}" title="${esc(fmtDate(d))}: ${did}${due.length ? '/' + due.length : ''} done"></i>`;
    }
  }
  return `<div class="hm-wrap"><div class="hm-months" style="grid-template-columns:repeat(${weeks},1fr)">${months}</div><div class="hm-grid" style="grid-template-columns:repeat(${weeks},1fr)">${cells}</div>
    <div class="hm-legend">Less <i class="hm l0"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i><i class="hm l4"></i> More</div></div>`;
}

function habitCard(p, day) {
  const on = isDone(day, p.id);
  const sched = scheduledOn(p, day);
  const st = streakOf(p);
  const status = sched ? (st.current ? `🔥 ${st.current}-day streak` : 'Start your streak today') : 'Not scheduled today';
  const meta = `${status}${p.remind ? ` · ⏰ ${esc(fmtTime(p.remind))}` : ''}`;
  if (p.type === 'count') {
    const n = countOf(day, p);
    const pct = Math.round(progressOf(day, p) * 100);
    return `<div class="sd-card hb-count ${on ? 'done' : ''} ${sched ? '' : 'off'}" data-p="${p.id}" style="--pc:${p.color};--pct:${pct}%">
      <span class="sd-emoji">${p.emoji}</span>
      <span class="sd-info"><b>${esc(p.name)}</b><small>${meta}</small>
        <span class="sd-bar"><span></span></span>
      </span>
      <span class="sd-stepper">
        <button class="sd-step" data-action="sd-dec" data-p="${p.id}" data-day="${day}" aria-label="Less" ${n ? '' : 'disabled'}>−</button>
        <label class="sd-val"><input type="number" min="0" max="9999" value="${n}" data-sd-count="${p.id}" data-day="${day}" aria-label="${esc(p.name)} count"><small>/${p.target}${p.unit ? ' ' + esc(p.unit) : ''}</small></label>
        <button class="sd-step plus" data-action="sd-inc" data-p="${p.id}" data-day="${day}" aria-label="More">+</button>
      </span>
    </div>`;
  }
  return `<button class="sd-card ${on ? 'done' : ''} ${sched ? '' : 'off'}" data-action="sd-toggle" data-p="${p.id}" data-day="${day}" style="--pc:${p.color}" aria-pressed="${on}">
    <span class="sd-emoji">${p.emoji}</span>
    <span class="sd-info"><b>${esc(p.name)}</b><small>${meta}</small></span>
    <span class="sd-check">${icon('check')}</span>
  </button>`;
}

function renderSadhana() {
  const T = todayStr();
  const day = ui.sadhanaDay && ui.sadhanaDay <= T ? ui.sadhanaDay : T;
  const filter = habitGroupFilter();
  const all = activePractices();
  const ps = filter === 'all' ? all : all.filter(p => p.group === filter);
  const groups = HABIT_GROUPS.filter(g => all.some(p => p.group === g.id));
  const hint = ps.some(p => p.group === 'sadhana') ? sadhanaHint(day) : '';
  const last7 = [];
  for (let i = 6; i >= 0; i--) last7.push(ymd(addDays(parseYmd(T), -i)));
  const sections = (filter === 'all' ? groups : groups.filter(g => g.id === filter))
    .map(g => ({ g, items: ps.filter(p => p.group === g.id) })).filter(s => s.items.length);
  return `
    <div class="sd-head">
      <div class="sd-nav">
        <button class="icon-btn sm" data-action="sd-day" data-delta="-1" aria-label="Previous day">${icon('chevronLeft')}</button>
        <b>${esc(fmtDate(day))}</b><span class="muted small">${esc(fmtShort(day))}</span>
        <button class="icon-btn sm" data-action="sd-day" data-delta="1" aria-label="Next day" ${day >= T ? 'disabled' : ''}>${icon('chevronRight')}</button>
      </div>
      <button class="btn ghost sm" data-action="sd-manage">${icon('edit')}Edit habits</button>
    </div>
    ${groups.length > 1 ? `<div class="cal-spaces hb-groups" role="tablist">
      <button class="space-chip ${filter === 'all' ? 'on' : ''}" data-action="hb-group" data-g="all">All</button>
      ${groups.map(g => `<button class="space-chip ${filter === g.id ? 'on' : ''}" data-action="hb-group" data-g="${g.id}">${g.emoji} ${esc(g.name)}</button>`).join('')}
    </div>` : ''}
    ${hint ? `<p class="sd-hint">${esc(hint)}</p>` : ''}
    ${filter === 'all' || filter === 'sadhana' ? panchangStrip(day, { compact: true }) : ''}
    ${sections.length ? sections.map(s => `
      ${sections.length > 1 ? `<h3 class="hb-group-title">${s.g.emoji} ${esc(s.g.name)}</h3>` : ''}
      <div class="sd-grid">${s.items.map(p => habitCard(p, day)).join('')}</div>`).join('')
      : '<p class="muted pad">No habits here yet — add one with “Edit habits”.</p>'}
    ${ps.length ? `
    <section class="sd-section">
      <h3>Last 7 days</h3>
      <div class="sd-table">
        <div class="sd-row sd-th"><span></span>${last7.map(d => `<span>${esc(parseYmd(d).toLocaleDateString(LOCALE, { weekday: 'narrow' }))}</span>`).join('')}<span>Streak</span><span>Best</span><span>Month</span></div>
        ${ps.map(p => { const st = streakOf(p); const mr = monthRate(p); return `<div class="sd-row" style="--pc:${p.color}">
          <span class="sd-pname">${p.emoji} ${esc(p.name)}</span>
          ${last7.map(d => { const pr = progressOf(d, p); return `<span><i class="sd-dot ${pr >= 1 ? 'on' : pr > 0 ? 'part' : scheduledOn(p, d) ? '' : 'na'}" style="--pp:${Math.round(pr * 100)}%" title="${esc(fmtDate(d))}${p.type === 'count' ? ': ' + countOf(d, p) + '/' + p.target : ''}"></i></span>`; }).join('')}
          <span><b>${st.current}</b></span><span>${st.best}</span><span>${mr == null ? '—' : mr + '%'}</span>
        </div>`; }).join('')}
      </div>
    </section>
    <section class="sd-section"><h3>${filter === 'all' ? 'All habits' : esc((HABIT_GROUPS.find(g => g.id === filter) || {}).name || '')} · last 6 months</h3>${heatmap(26, ps)}</section>` : ''}`;
}

function celebrateIfAllDone(day) {
  const T = todayStr();
  if (day !== T) return false;
  const all = activePractices().filter(x => scheduledOn(x, T));
  if (all.length > 1 && all.every(x => isDone(T, x.id))) { celebrate(); toast('🙏 Every habit done today — beautiful!'); return true; }
  return false;
}
function setHabitCount(pid, day, n) {
  const p = state.practices.find(x => x.id === pid);
  if (!p || day > todayStr()) return;
  const before = isDone(day, pid);
  n = Math.max(0, Math.min(9999, Math.round(n) || 0));
  commit(() => {
    if (!n) { if (state.sadhana[day]) { delete state.sadhana[day][pid]; if (!Object.keys(state.sadhana[day]).length) delete state.sadhana[day]; } }
    else (state.sadhana[day] = state.sadhana[day] || {})[pid] = { done: n >= p.target, count: n, at: Date.now() };
  });
  if (!before && isDone(day, pid) && !celebrateIfAllDone(day)) {
    const s = streakOf(p).current;
    toast(`${p.emoji} ${p.name} — goal reached${s > 1 ? ` · ${s}-day streak 🔥` : ''}`, { undo: true });
  }
}

function togglePractice(pid, day = todayStr()) {
  const p = state.practices.find(x => x.id === pid);
  if (!p || day > todayStr()) return;
  if (p.type === 'count') { setHabitCount(pid, day, isDone(day, pid) ? 0 : p.target); return; }
  const was = isDone(day, pid);
  commit(() => {
    if (was) { delete state.sadhana[day][pid]; if (!Object.keys(state.sadhana[day]).length) delete state.sadhana[day]; }
    else (state.sadhana[day] = state.sadhana[day] || {})[pid] = { done: true, at: Date.now() };
  });
  if (was || celebrateIfAllDone(day)) return;
  const s = streakOf(p).current;
  toast(s > 1 ? `${p.emoji} ${p.name} · ${s}-day streak 🔥` : `${p.emoji} ${p.name} done`, { undo: true });
}

function openPracticeEditor() {
  const DOW = [0, 1, 2, 3, 4, 5, 6].map(i => new Date(2024, 0, 7 + i).toLocaleDateString(LOCALE, { weekday: 'narrow' }));
  const draw = m => {
    const ps = [...state.practices].sort((a, b) => (HABIT_GROUPS.findIndex(g => g.id === a.group) - HABIT_GROUPS.findIndex(g => g.id === b.group)) || a.order - b.order);
    m.querySelector('.pe-list').innerHTML = ps.map(p => `
      <div class="pe-row ${p.archived ? 'archived' : ''}" data-p="${p.id}" style="--pc:${p.color}">
        <input class="pe-emoji" value="${esc(p.emoji)}" maxlength="4" data-f="emoji" aria-label="Emoji">
        <input class="pe-name" value="${esc(p.name)}" data-f="name" aria-label="Habit name">
        <select data-f="group" aria-label="Group">${HABIT_GROUPS.map(g => `<option value="${g.id}" ${p.group === g.id ? 'selected' : ''}>${g.emoji} ${esc(g.name)}</option>`).join('')}</select>
        <span class="pe-goal">
          <select data-f="type" aria-label="Type"><option value="check" ${p.type === 'check' ? 'selected' : ''}>Yes / no</option><option value="count" ${p.type === 'count' ? 'selected' : ''}>Count</option></select>
          ${p.type === 'count' ? `<input type="number" min="1" max="9999" value="${p.target}" data-f="target" aria-label="Daily target"><input class="pe-unit" value="${esc(p.unit)}" placeholder="unit" data-f="unit" aria-label="Unit">` : ''}
        </span>
        <div class="pe-days" role="group" aria-label="Days">${DOW.map((l, i) => `<button class="${p.days.includes(i) ? 'on' : ''}" data-day="${i}" aria-pressed="${p.days.includes(i)}">${l}</button>`).join('')}</div>
        <label class="pe-time" title="Daily reminder">${icon('bell')}<input type="time" value="${p.remind || ''}" data-f="remind" aria-label="Reminder time"></label>
        <button class="icon-btn sm" data-pe="${p.archived ? 'restore' : 'archive'}" title="${p.archived ? 'Show again' : 'Hide (keeps history)'}">${icon(p.archived ? 'repeat' : 'x')}</button>
      </div>`).join('');
    const have = new Set(state.practices.map(p => p.name.toLowerCase()));
    m.querySelector('.pe-templates').innerHTML = HABIT_TEMPLATES.filter(t => !have.has(t.name.toLowerCase()))
      .map((t, i) => `<button class="pe-tpl" data-tpl="${HABIT_TEMPLATES.indexOf(t)}" style="--pc:${t.color}">${t.emoji} ${esc(t.name)}${t.type === 'count' ? ` <small>${t.target} ${esc(t.unit)}</small>` : ''}</button>`).join('');
  };
  const addHabit = (base, m) => {
    const order = Math.max(-1, ...state.practices.map(p => p.order)) + 1;
    commit(() => { state.practices.push(practiceFrom({ id: uid(), days: ALL_DAYS, color: LIST_COLORS[order % LIST_COLORS.length], ...base, order })); });
    draw(m);
  };
  openModal(`
    <div class="modal-card wide pe-card">
      <div class="modal-title-row"><h2>Your habits</h2><button class="icon-btn sm" data-m="cancel" aria-label="Close">${icon('x')}</button></div>
      <p class="muted small">“Yes / no” habits are ticked once; “Count” habits have a daily goal (8 glasses, 20 pages…). Choose days and an optional reminder. Hidden habits keep their history.</p>
      <div class="pe-list"></div>
      <div class="pe-add">
        <b class="small">Quick add</b>
        <div class="pe-templates"></div>
      </div>
      <div class="modal-actions"><button class="btn ghost sm" data-pe="add">${icon('plus')}Custom habit</button><span class="spacer"></span><button class="btn primary" data-m="cancel">Done</button></div>
    </div>`, m => {
    draw(m);
    const get = el => state.practices.find(p => p.id === el.closest('[data-p]').dataset.p);
    m.addEventListener('click', e => {
      const dayBtn = e.target.closest('.pe-days [data-day]');
      const tpl = e.target.closest('[data-tpl]');
      const act = e.target.closest('[data-pe]')?.dataset.pe;
      if (dayBtn) {
        const p = get(dayBtn);
        const i = +dayBtn.dataset.day;
        if (p.days.includes(i) && p.days.length === 1) { toast('Keep at least one day'); return; }
        commit(() => { p.days = p.days.includes(i) ? p.days.filter(x => x !== i) : [...p.days, i].sort(); });
        draw(m);
      } else if (tpl) {
        addHabit({ ...HABIT_TEMPLATES[+tpl.dataset.tpl] }, m);
        toast(`Added ${HABIT_TEMPLATES[+tpl.dataset.tpl].name}`);
      } else if (act === 'archive' || act === 'restore') {
        const p = get(e.target);
        commit(() => { p.archived = act === 'archive'; });
        draw(m);
      } else if (act === 'add') {
        const g = habitGroupFilter();
        addHabit({ name: 'New habit', emoji: '✨', group: g === 'all' ? 'other' : g }, m);
        const rows = m.querySelectorAll('.pe-row');
        [...rows].find(r => r.querySelector('.pe-name').value === 'New habit')?.querySelector('.pe-name').select();
      }
    });
    m.addEventListener('change', e => {
      const f = e.target.dataset.f;
      if (!f) return;
      const p = get(e.target);
      const v = e.target.value.trim();
      commit(() => {
        if (f === 'name') p.name = v || p.name;
        if (f === 'emoji') p.emoji = v || '✨';
        if (f === 'remind') p.remind = v || null;
        if (f === 'group') p.group = v;
        if (f === 'type') { p.type = v; if (v === 'count' && p.target < 2) { p.target = 8; p.unit = p.unit || 'times'; } }
        if (f === 'target') p.target = Math.max(1, Math.min(9999, parseInt(v, 10) || 1));
        if (f === 'unit') p.unit = v.slice(0, 20);
      });
      if (f === 'type' || f === 'group') draw(m);
      if (f === 'remind' && v) askNotifyPermission();
    });
  });
}

const MOON_EMOJI = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
function panchangStrip(day, { compact } = {}) {
  if (!window.Panchang || state.settings.showPanchang === false) return '';
  const i = Panchang.dayInfo(day);
  const moon = MOON_EMOJI[Math.round(Panchang.elongation(i.sunrise.getTime()) / 45) % 8];
  const loc = currentLocation();
  return `<section class="panchang ${compact ? 'compact' : ''}">
    <button class="pc-loc" data-action="pick-location" title="Change location">${icon('mapPin')}<span>${esc(loc.name.replace('Art of Living International Center', 'AoL Bengaluru'))}</span>${icon('chevronDown')}</button>
    <div class="pc-items">
      <span class="pc-item" title="Sunrise">${icon('sunrise')}<span><b>${clock(i.sunrise)}</b><small>Sunrise</small></span></span>
      <span class="pc-item" title="Sunset">${icon('sunset')}<span><b>${clock(i.sunset)}</b><small>Sunset</small></span></span>
      <span class="pc-item tithi" title="Tithi at sunrise">${moon}<span><b>${esc(i.tithi.label)}</b><small>until ${esc(clockOn(i.tithi.endsAt, day))}</small></span></span>
      <span class="pc-item" title="Brahma Muhurta — the pre-dawn window traditionally best for meditation">🧘<span><b>${clock(i.brahma[0])}–${clock(i.brahma[1])}</b><small>Brahma Muhurta</small></span></span>
      <span class="pc-item" title="Rahu Kaal — traditionally avoided for new beginnings">${icon('hourglass')}<span><b>${clock(i.rahu[0])}–${clock(i.rahu[1])}</b><small>Rahu Kaal</small></span></span>
    </div>
  </section>`;
}

// Which event calendars this view shows: festivals everywhere, plus the space calendars in scope.
function eventScope() {
  const v = ui.view;
  let spaces = SPACES;
  if (v.type === 'list') spaces = SPACES.filter(s => s.id === (getList(v.id) || {}).space);
  else if (v.type === 'smart' && v.id === 'calendar' && state.settings.calSpace !== 'all') spaces = SPACES.filter(s => s.id === state.settings.calSpace);
  else if (v.type === 'tag' || ui.search || v.id === 'completed') return [];
  return ['festivals', ...spaces.flatMap(s => s.events || [])];
}
const layerOn = id => (state.settings.calLayers || {})[id] !== false;
function eventsByDate(from, to, sets = eventScope().filter(layerOn)) {
  const map = {};
  if (!sets.length) return map;
  for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
    for (const e of eventsForYear(y)) if (!e.hidden && e.d >= from && e.d <= to && sets.includes(e.set)) (map[e.d] = map[e.d] || []).push(e);
  }
  const rank = e => (e.k === 'holiday' ? 0 : e.k.startsWith('moon') || e.k === 'vrat' ? 1 : e.set === 'festivals' ? 2 : 3);
  Object.values(map).forEach(a => a.sort((x, z) => rank(x) - rank(z) || (x.time || '').localeCompare(z.time || '')));
  return map;
}
const evPill = e => `<span class="ev-pill ${e.k} ${e.sacred && sacredOn() ? 'sacred' : ''}" style="--ec:${setOf(e).color}" title="${esc(setOf(e).name)}">${emojiOf(e)} ${esc(e.t)}</span>`;
function dayEventsBlock(evs) {
  if (!evs || !evs.length) return '';
  return `<div class="day-events">${evs.map(e => {
    const s = setOf(e);
    const sacred = e.sacred && sacredOn();
    const meta = [s.name, sacred && 'Sacred day', e.time && fmtTime(e.time), e.k === 'holiday' && 'Public holiday', e.k === 'deadline' && 'Deadline', e.tentative && 'Date may change'].filter(Boolean).join(' · ');
    return `<div class="day-ev ${e.k} ${sacred ? 'sacred' : ''}" style="--ec:${s.color}">
      <span class="de-emoji" aria-hidden="true">${emojiOf(e)}</span>
      <div class="de-main"><b>${esc(e.t)}</b><span class="de-meta">${esc(meta)}</span>${e.note ? `<span class="de-note">${esc(e.note)}</span>` : ''}</div>
      ${e.personId ? `<button class="btn primary sm wish-btn" data-action="wish" data-person="${e.personId}" data-kind="${e.k}" title="Send wishes on WhatsApp">${icon('sparkles')}<span>Wish</span></button>` : ''}
      <button class="btn ghost sm" data-action="plan-event" data-ev="${e.id}" title="Create a task for this">${icon('plus')}<span>Plan</span></button>
    </div>`;
  }).join('')}</div>`;
}
function planEvent(id) {
  const e = findEvent(id);
  if (!e) return;
  const v = ui.view;
  const sp = SPACES.find(s => (s.events || []).includes(e.set));
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
  const legend = (scope.includes('moon') && layerOn('moon')) || sacredOn()
    ? `<div class="cal-legend">${scope.includes('moon') && layerOn('moon') ? '<span><i class="lg-full"></i>🌕 Purnima</span><span><i class="lg-new"></i>🌑 Amavasya</span>' : ''}${sacredOn() ? '<span>✨ Sacred day</span>' : ''}<span class="muted">Moon days follow Bengaluru sunrise; local panchangs can differ by a day.</span></div>`
    : '';
  return spaces || layers ? `<div class="cal-filters">${spaces}${layers}</div>${legend}` : '';
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
  const moons = moonDays(ymd(start), ymd(addDays(start, 41)));
  const sacred = sacredOn();
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
      ...dayEvs.filter(e => !(e.k.startsWith('moon') && e.t.startsWith(e.k === 'moon-full' ? 'Purnima' : 'Amavasya'))) // plain moon days show as a badge, not a chip
        .map(e => `<div class="cal-ev ${e.k} ${e.sacred && sacred ? 'sacred' : ''}" style="--ec:${setOf(e).color}" title="${esc(setOf(e).name + ': ' + e.t)}"><span class="ev-emo">${emojiOf(e)} </span>${esc(e.t)}</div>`),
      ...items.map(t => `<div class="cal-task ${t.done ? 'done' : ''} ${isMeeting(t) ? 'meeting' : ''}" style="--sc:${statusOf(t.status).color}" data-id="${t.id}" data-action="open" draggable="true" title="${esc(t.title)}${t.link ? ' · ' + esc((callProvider(t.link) || {}).name || '') : ''}">${isMeeting(t) ? icon('video', 'cal-vid') : ''}${t.time ? `<span class="cal-time">${esc(fmtTime(t.time))}</span>` : ''}${esc(t.title)}</div>`),
    ];
    const holiday = dayEvs.some(e => e.k === 'holiday');
    const moon = moons[ds];
    const isSacred = sacred && dayEvs.some(e => e.sacred);
    const moonLabel = moon === 'moon-full' ? 'Purnima (full moon)' : moon === 'moon-new' ? 'Amavasya (new moon)' : '';
    cells += `<div class="cal-cell ${outside ? 'outside' : ''} ${ds === T ? 'is-today' : ''} ${ds === ui.calDay ? 'is-selected' : ''} ${holiday ? 'is-holiday' : ''} ${moon || ''} ${isSacred ? 'is-sacred' : ''}" data-date="${ds}" role="gridcell" aria-label="${esc(d.toLocaleDateString(LOCALE, { dateStyle: 'full' }))}, ${plural(items.length, 'task')}${moonLabel ? ', ' + moonLabel : ''}${dayEvs.length ? ', ' + esc(dayEvs.map(e => e.t).join(', ')) : ''}">
      <div class="cal-day"><span>${d.getDate()}</span>${moon ? `<b class="moon-badge" title="${moonLabel}">${moon === 'moon-full' ? '🌕' : '🌑'}</b>` : isSacred ? '<b class="moon-badge" title="Sacred day">✨</b>' : ''}</div>
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
      ${panchangStrip(ui.calDay, { compact: true })}
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
  if (p.url) {
    const u = safeUrl(p.url);
    const prov = u && isCallUrl(u) ? callProvider(u) : null;
    chips.push(prov
      ? `<span class="pchip hit" style="--pc:${prov.color}">${icon('video')}${esc(prov.name)} meeting</span>`
      : `<span class="pchip">${icon('link')}Link saved to notes</span>`);
  }
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
          ${!t.parentId ? `<div class="seg type-seg" role="radiogroup" aria-label="Type">
            <button class="${!isMeeting(t) ? 'on' : ''}" data-d="type" data-v="task" role="radio" aria-checked="${!isMeeting(t)}">${icon('checkCircle')}Task</button>
            <button class="${isMeeting(t) ? 'on' : ''}" data-d="type" data-v="meeting" role="radio" aria-checked="${isMeeting(t)}">${icon('video')}Meeting</button>
          </div>` : ''}
        </div>
        <textarea class="d-title ${t.done ? 'done' : ''}" rows="1" data-field="title" placeholder="${isMeeting(t) ? 'Meeting name' : 'Task name'}" aria-label="${isMeeting(t) ? 'Meeting name' : 'Task name'}">${esc(t.title)}</textarea>
        ${isMeeting(t) ? meetingBox(t) : ''}

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
function meetingBox(t) {
  const prov = t.link ? callProvider(t.link) : null;
  const ms = meetingState(t);
  const when = t.due && t.time ? `${fmtDate(t.due)} · ${fmtTime(t.time)}–${fmtTime(endTime(t))}` : t.due ? fmtDate(t.due) : 'Set a date and time below';
  const status = ms ? (ms.state === 'live' ? (ms.mins > 0 ? `Starts in ${ms.mins} min` : 'Happening now') : `Starts in ${ms.mins} min`) : '';
  return `<div class="meet-box ${ms ? ms.state : ''}" style="--pc:${prov ? prov.color : 'var(--accent)'}">
    <div class="mb-head">
      <span class="mb-ico">${icon('video')}</span>
      <div class="mb-title"><b>${prov && prov.id !== 'link' ? esc(prov.name) + ' meeting' : 'Meeting'}</b><span>${esc(when)}${status ? ` · <em>${esc(status)}</em>` : ''}</span></div>
      ${t.link ? `<button class="btn primary sm mb-join" data-d="join">${icon('video')}${ms && ms.state === 'live' ? 'Join now' : 'Join'}</button>` : ''}
    </div>
    <div class="mb-row">
      ${icon('link', 'mb-link-ico')}
      <input class="mb-link" type="url" inputmode="url" data-field="link" value="${esc(t.link || '')}" placeholder="Paste a Google Meet, Zoom or Teams link" autocomplete="off" spellcheck="false" aria-label="Call link">
      ${t.link ? `<button class="icon-btn sm" data-d="copy-link" title="Copy link" aria-label="Copy link">${icon('copy')}</button>` : ''}
    </div>
    <div class="mb-row">
      ${icon('hourglass', 'mb-link-ico')}
      <span class="mb-label">Duration</span>
      <select data-field="duration" aria-label="Duration">${[15, 30, 45, 60, 90, 120, 180].map(m => `<option value="${m}" ${meetingMinutes(t) === m ? 'selected' : ''}>${m < 60 ? m + ' min' : m / 60 + (m === 60 ? ' hour' : ' hours')}</option>`).join('')}</select>
    </div>
  </div>`;
}
function autosize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 2 + 'px';
}

let editSnap = false;
function bindDetails() {
  const det = $('#details');
  det.addEventListener('focusin', () => { editSnap = false; });
  // A pasted meeting link saves right away (blur fires "change")
  det.addEventListener('paste', e => { if (e.target.matches('.mb-link')) setTimeout(() => e.target.blur(), 0); });
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
      case 'type': {
        const v = b.dataset.v;
        if (t.type === v) break;
        commit(() => {
          t.type = v;
          if (v === 'meeting' && !t.duration) t.duration = 30;
          if (v === 'meeting' && t.time && t.remind == null) t.remind = 10;
        });
        if (v === 'meeting') setTimeout(() => $('.mb-link', det)?.focus(), 0);
        break;
      }
      case 'join': openLink(t.link); break;
      case 'copy-link':
        navigator.clipboard?.writeText(t.link).then(() => toast('Link copied'), () => toast('Couldn’t copy — select the link and copy it'));
        break;
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
      case 'link': {
        if (!v.trim()) { commit(() => { t.link = null; }); break; }
        const u = safeUrl(v);
        if (!u) { toast('That doesn’t look like a link — paste the full meeting URL'); renderDetails(); break; }
        commit(() => { t.link = u; t.type = 'meeting'; if (!t.duration) t.duration = 30; });
        break;
      }
      case 'duration': commit(() => { t.duration = +v || 30; }); break;
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
    } else if (e.target.dataset.field === 'link' && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
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
        <div><b>Location</b><div class="muted small">For sunrise, sunset and panchang · ${esc(currentLocation().name)}</div></div>
        <button class="btn ghost sm" data-act="location">${icon('mapPin')}Change</button>
      </div>
      ${isNative ? `<div class="set-row">
        <div><b>Home-screen widget</b><div class="muted small">Today’s tasks, next meeting and quick add on your home screen</div></div>
        <button class="btn ghost sm" data-act="widget">${icon('plus')}Add to home screen</button>
      </div>` : ''}
      <div class="set-row">
        <div><b>Birthdays & anniversaries</b><div class="muted small">${state.people.length ? peopleCount(state.people.length) + ' saved' : 'Add people or import from Google Contacts'}</div></div>
        <button class="btn ghost sm" data-act="people">🎂 Manage</button>
      </div>
      <div class="set-row">
        <div><b>Daily panchang on Today</b><div class="muted small">Sunrise, tithi, Brahma Muhurta and Rahu Kaal</div></div>
        <div class="seg" data-set="showPanchang">${[['true', 'Show'], ['false', 'Hide']].map(([v, l]) => `<button class="${String(s.showPanchang !== false) === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
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
        const v = seg.dataset.v;
        state.settings[key] = v === 'true' ? true : v === 'false' ? false : v;
        save(); applyTheme(); render();
        $$('[data-v]', seg.parentElement).forEach(b => b.classList.toggle('on', b === seg));
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'export') exportData();
      if (act === 'account') openAccount();
      if (act === 'location') openLocationPicker();
      if (act === 'people') openPeopleManager();
      if (act === 'widget' && native.WidgetBridge) {
        updateWidget();
        const r = await native.WidgetBridge.pin().catch(() => ({ requested: false }));
        if (!r.requested) toast('Long-press your home screen → Widgets → Doable to add it');
      }
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
    ['#errands', 'Tag'], ['@work', 'List'], ['*', 'Star'], ['paste a Meet / Zoom / Teams link', 'Meeting + Join button'],
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
  // Practice reminders (in-app; the Android app also gets scheduled notifications)
  const T = todayStr();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  ui.practiceNotified = ui.practiceNotified || new Set();
  for (const p of activePractices()) {
    if (!p.remind || !scheduledOn(p, T) || isDone(T, p.id)) continue;
    const [h, m] = p.remind.split(':').map(Number);
    const key = `${T}:${p.id}`;
    if (nowMin >= h * 60 + m && nowMin < h * 60 + m + 60 && !ui.practiceNotified.has(key)) {
      ui.practiceNotified.add(key);
      toast(`${p.emoji} Time for ${p.name}`, { duration: 12000, action: { label: 'Mark done', fn: () => togglePractice(p.id) } });
      if (!isNative && 'Notification' in window && Notification.permission === 'granted') {
        navigator.serviceWorker?.getRegistration().then(reg => (reg ? reg.showNotification(`${p.emoji} ${p.name}`, { body: 'Time for your practice', tag: key }) : new Notification(`${p.emoji} ${p.name}`, { body: 'Time for your practice' }))).catch(() => {});
      }
    }
  }
  if (ui.lastDay !== todayStr()) { ui.lastDay = todayStr(); render(); }
}
function notify(t) {
  const prov = t.link && !t.done ? callProvider(t.link) : null;
  const body = `${t.time ? fmtTime(t.time) : fmtDate(t.due)}${getList(t.listId) ? ' · ' + getList(t.listId).name : ''}${prov ? ` · Join on ${prov.name === 'call' ? 'the call link' : prov.name}` : ''}`;
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
    case 'pick-location': openLocationPicker(); break;
    case 'people': openPeopleManager(); break;
    case 'wish': {
      const p = state.people.find(x => x.id === el.dataset.person);
      if (p) openLink(wishUrl(p, el.dataset.kind));
      break;
    }
    case 'sd-toggle': togglePractice(el.dataset.p, el.dataset.day || todayStr()); break;
    case 'sd-day': {
      const cur = ui.sadhanaDay || todayStr();
      const next = ymd(addDays(parseYmd(cur), +el.dataset.delta));
      ui.sadhanaDay = next > todayStr() ? todayStr() : next;
      renderMain();
      break;
    }
    case 'sd-manage': openPracticeEditor(); break;
    case 'sd-inc': case 'sd-dec': {
      const p = state.practices.find(x => x.id === el.dataset.p);
      const day = el.dataset.day || todayStr();
      if (p) setHabitCount(p.id, day, countOf(day, p) + (a === 'sd-inc' ? habitStep(p) : -habitStep(p)));
      break;
    }
    case 'hb-group': state.settings.habitGroup = el.dataset.g; save(); renderMain(); break;
    case 'join': { const t = getTask(id); if (t && t.link) openLink(t.link); break; }
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
  // Count habits: type a number directly
  content.addEventListener('change', e => {
    const inp = e.target.closest('[data-sd-count]');
    if (inp) setHabitCount(inp.dataset.sdCount, inp.dataset.day || todayStr(), +inp.value);
  });
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

  // Keep "Starts in N min" / "Join now" current without interrupting typing
  let meetSig = '';
  setInterval(() => {
    const sig = upNextMeetings().map(({ t, ms }) => t.id + ms.state + ms.mins).join('|');
    if (sig === meetSig) return;
    meetSig = sig;
    const ae = document.activeElement;
    if (ae && ae.matches('input, textarea, select')) return;
    renderMain();
    if (ui.openId) renderDetails();
  }, 30000);
}

/* ---------- Native app (Android via Capacitor) ---------- */
const Cap = window.Capacitor;
const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const native = isNative ? {
  App: Cap.registerPlugin('App'),
  Notifications: Cap.registerPlugin('LocalNotifications'),
  SystemBars: window.capacitorExports && window.capacitorExports.SystemBars,
  WidgetBridge: Cap.registerPlugin('WidgetBridge'),
} : {};
if (isNative) document.documentElement.classList.add('native');

/* ---------- Home-screen widget (Android) ---------- */
let widgetTimer = 0;
// Sends a compact summary for today and tomorrow; the widget shows whichever matches the device date.
function updateWidget() {
  if (!native.WidgetBridge) return;
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(() => {
    try {
      const T = todayStr();
      const days = {};
      for (const offset of [0, 1]) {
        const day = ymd(addDays(new Date(), offset));
        const top = state.tasks.filter(t => !t.parentId && !t.done && ((t.due && (offset === 0 ? t.due <= day : t.due === day)) || t.myDay === day));
        const sorted = top.sort((a, b) => ((a.due || '') < day) - ((b.due || '') < day) || (a.time || '99').localeCompare(b.time || '99') || prioRank(a.priority) - prioRank(b.priority));
        const items = sorted.slice(0, 5).map(t => ({
          id: t.id,
          t: (isMeeting(t) ? '🎥 ' : '') + (t.title || 'Untitled'),
          meta: t.due && t.due < day ? 'Overdue' : t.time ? fmtTime(t.time) : '',
          color: t.priority ? prioOf(t.priority).color : statusOf(t.status).color,
        }));
        const meetings = state.tasks.filter(t => isMeeting(t) && !t.done && t.due === day && t.time && (offset > 0 || endTime(t) > `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`)).sort((a, b) => a.time.localeCompare(b.time));
        const m = meetings[0];
        const practices = activePractices().filter(p => scheduledOn(p, day));
        const doneP = practices.filter(p => isDone(day, p.id)).length;
        const bits = [];
        if (window.Panchang) bits.push(Panchang.dayInfo(day).tithi.label);
        if (practices.length) bits.push(`Habits ${doneP}/${practices.length}`);
        const bdays = (eventsByDate(day, day, ['birthdays'])[day] || []).map(e => `🎂 ${e.t.split("'")[0]}`);
        bits.push(...bdays);
        days[day] = {
          label: parseYmd(day).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }) + (top.length ? ` · ${top.length} to do` : ''),
          items,
          more: Math.max(0, sorted.length - items.length),
          next: m ? { t: m.title || 'Meeting', meta: `${fmtTime(m.time)}${m.link ? ' · ' + ((callProvider(m.link) || {}).name || 'call') : ''}`, url: `doable://task/${m.id}` } : null,
          footer: bits.join('  ·  '),
          empty: offset === 0 ? 'Nothing due today ✨' : 'Nothing planned',
        };
      }
      native.WidgetBridge.update({ data: JSON.stringify({ updated: Date.now(), days }) }).catch(() => {});
    } catch (e) { console.warn('Widget update failed', e); }
  }, 800);
}
// Links from the widget: doable://today, doable://quickadd, doable://task/<id>
function handleAppUrl(url) {
  const m = String(url || '').match(/^doable:\/\/([^/?#]+)\/?([^?#]*)/);
  if (!m) return;
  closeModal();
  if (m[1] === 'quickadd') { navigate('smart:today'); setTimeout(focusQuickAdd, 150); }
  else if (m[1] === 'task' && getTask(m[2])) openDetails(m[2]);
  else navigate('smart:today');
}

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
      const items = upcoming.map(({ t, fire }) => ({
        id: notifId(t.id),
        title: t.title || 'Task reminder',
        body: [t.time ? fmtTime(t.time) : fmtDate(t.due), getList(t.listId) && getList(t.listId).name, t.link && `Tap to join on ${(callProvider(t.link) || {}).name || 'the call'}`].filter(Boolean).join(' · '),
        fire,
        extra: { taskId: t.id },
      }));
      // Birthdays & anniversaries at 9 AM on the day, next 30 days
      const bdays = eventsByDate(todayStr(), ymd(addDays(new Date(), 30)), ['birthdays']);
      for (const [day, evs] of Object.entries(bdays)) {
        for (const e of evs) {
          const at = parseYmd(day);
          at.setHours(9, 0, 0, 0);
          if (at.getTime() > now + 5000) items.push({ id: notifId(`bd:${e.personId}:${e.k}:${day}`), title: `${e.emoji} ${e.t}`, body: 'Tap to send your wishes', fire: at.getTime(), extra: { personId: e.personId, kind: e.k } });
        }
      }
      // Practice reminders for the next 7 days (skipping days already ticked)
      for (const p of activePractices()) {
        if (!p.remind) continue;
        const [h, m] = p.remind.split(':').map(Number);
        for (let i = 0; i < 7; i++) {
          const day = ymd(addDays(new Date(), i));
          if (!scheduledOn(p, day) || isDone(day, p.id)) continue;
          const at = parseYmd(day);
          at.setHours(h, m, 0, 0);
          if (at.getTime() > now + 5000) items.push({ id: notifId(`pr:${p.id}:${day}`), title: `${p.emoji} ${p.name}`, body: 'Time for your practice · tap to open Sadhana', fire: at.getTime(), extra: { practiceId: p.id } });
        }
      }
      items.sort((a, b) => a.fire - b.fire);
      const list = items.slice(0, 60).map(({ fire, ...n }) => ({ ...n, schedule: { at: new Date(fire), allowWhileIdle: true } }));
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
  native.App.addListener('resume', () => { checkReminders(); updateWidget(); if (window.DoableSync) DoableSync.syncNow(); });
  native.App.addListener('appUrlOpen', ev => handleAppUrl(ev && ev.url));
  native.App.getLaunchUrl().then(r => { if (r && r.url) handleAppUrl(r.url); }).catch(() => {});
  updateWidget();
  native.Notifications.addListener('localNotificationActionPerformed', ev => {
    const extra = (ev && ev.notification && ev.notification.extra) || {};
    if (extra.practiceId) { navigate('smart:sadhana'); return; }
    if (extra.personId) { navigate('smart:today'); return; }
    const id = extra.taskId;
    const t = id && getTask(id);
    if (!t) return;
    openDetails(id);
    if (t.link && !t.done) openLink(t.link); // "Tap to join"
  });
  scheduleNativeReminders();
}

/* ---------- Cloud sync ---------- */
const SYNCED_SETTINGS = ['accent', 'weekStart', 'newOnTop', 'sort', 'group', 'defaultListId', 'calLayers', 'spacesInit', 'sadhanaInit'];

// Local state as sync records: one per task and list, plus shared settings and stats.
function syncRecords() {
  const m = new Map();
  state.lists.forEach((l, i) => m.set('list:' + l.id, { kind: 'list', data: { ...listFrom(l), pos: i } }));
  state.tasks.forEach(t => m.set('task:' + t.id, { kind: 'task', data: t }));
  const s = {};
  SYNCED_SETTINGS.forEach(k => { s[k] = state.settings[k] ?? null; });
  m.set('settings', { kind: 'settings', data: s });
  m.set('stats', { kind: 'stats', data: { completions: state.stats.completions } });
  state.practices.forEach(p => m.set('practice:' + p.id, { kind: 'practice', data: p }));
  // One record per check-in, so ticking different practices on two devices never conflicts
  Object.entries(state.sadhana).forEach(([day, logs]) => Object.entries(logs).forEach(([pid, log]) => m.set(`sadhana:${day}:${pid}`, { kind: 'sadhana', data: log })));
  state.people.forEach(p => m.set('person:' + p.id, { kind: 'person', data: p }));
  return m;
}

function applyRemote(rows, replace = false) {
  if (replace) { state.tasks = []; state.lists = []; state.practices = []; state.sadhana = {}; state.people = []; }
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
    } else if (r.kind === 'practice') {
      const id = r.id.slice(9);
      const i = state.practices.findIndex(p => p.id === id);
      if (r.deleted) { if (i >= 0) state.practices.splice(i, 1); }
      else { const p = practiceFrom({ ...d, id }); if (i >= 0) state.practices[i] = p; else state.practices.push(p); }
      changed = true;
    } else if (r.kind === 'sadhana') {
      const [, day, pid] = r.id.split(':');
      if (r.deleted) { if (state.sadhana[day]) { delete state.sadhana[day][pid]; if (!Object.keys(state.sadhana[day]).length) delete state.sadhana[day]; } }
      else (state.sadhana[day] = state.sadhana[day] || {})[pid] = { done: true, ...d };
      changed = true;
    } else if (r.kind === 'person') {
      const id = r.id.slice(7);
      const i = state.people.findIndex(p => p.id === id);
      if (r.deleted) { if (i >= 0) state.people.splice(i, 1); }
      else { const p = { ...d, id }; if (i >= 0) state.people[i] = p; else state.people.push(p); }
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
applyLocation();
if (ensureSpaces() | ensureSadhana()) save();
bindEvents();
bindDetails();
bindNative();
render();
if (!authHash && !applyHash()) syncHash();
addEventListener('hashchange', applyHash);
checkReminders();
refreshLocationIfAllowed();
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
