/* Doable — date utilities + natural-language quick-add parser.
 * Turns "Call mom tomorrow 6pm #family !1 @Personal every week" into structured fields. */
(function (global) {
  'use strict';

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const addMonths = (d, n) => {
    const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(d.getDate(), last));
    return x;
  };

  const DAY_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAY_ABBR = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, weds: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const DAY_FULL_RE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday)';
  const DAY_ABBR_RE = '(sun|mon|tues?|weds?|thu(?:rs?)?|fri|sat)';
  const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const UNIT_FREQ = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' };
  const PREFIX = '(?:(?:on|by|due|for)\\s+)?';

  const dayIndex = w => {
    w = w.toLowerCase();
    const i = DAY_FULL.indexOf(w);
    return i >= 0 ? i : (DAY_ABBR[w] ?? -1);
  };
  // Next occurrence of weekday idx; "today" counts only when allowToday.
  const nextWeekday = (from, idx, allowToday) => {
    const diff = (idx - from.getDay() + 7) % 7;
    return addDays(from, diff === 0 && !allowToday ? 7 : diff);
  };
  const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

  function parse(input, opts = {}) {
    const today = startOfDay(opts.now || new Date());
    const lists = opts.lists || [];
    const monthFirst = opts.monthFirst ?? true;
    let text = ` ${input} `;
    const r = { title: '', due: null, time: null, priority: 0, tags: [], listId: null, repeat: null, starred: false };

    // Run regex; if fn doesn't return false, cut the match out of the text.
    const take = (re, fn) => {
      const m = text.match(re);
      if (!m || fn(m) === false) return false;
      text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
      return true;
    };
    const setDue = d => { r.due = ymd(d); };

    // Tags (#tag), list (@list), priority (!1 / !!! / p1), star (*)
    let guard = 0;
    while (guard++ < 20 && take(/\s#([\p{L}\p{N}_-]+)/u, m => { const t = m[1].toLowerCase(); if (!r.tags.includes(t)) r.tags.push(t); }));
    take(/\s@([\p{L}\p{N}_-]+)/u, m => {
      const key = norm(m[1]);
      const list = lists.find(l => norm(l.name) === key) || lists.find(l => norm(l.name).startsWith(key));
      if (!list) return false;
      r.listId = list.id;
    });
    take(/\s(!!!|!!|!|![1-4]|p[1-4])(?=\s)/i, m => {
      const t = m[1].toLowerCase();
      const p = t === '!!!' ? 1 : t === '!!' ? 2 : t === '!' ? 3 : Number(t.slice(-1));
      r.priority = p;
    });
    take(/\s\*(?=\s)/, () => { r.starred = true; });

    // Repeat rules
    take(/\b(?:every\s+week\s?day|on\s+weekdays|weekdays)\b/i, () => { r.repeat = { freq: 'weekdays', interval: 1 }; })
      || take(/\bevery\s+(other\s+|\d+\s+)?(day|week|month|year)s?\b/i, m => {
        const n = !m[1] ? 1 : /other/i.test(m[1]) ? 2 : parseInt(m[1], 10);
        r.repeat = { freq: UNIT_FREQ[m[2].toLowerCase()], interval: Math.max(1, n) };
      })
      || take(new RegExp(`\\bevery\\s+(?:${DAY_FULL_RE}|${DAY_ABBR_RE})\\b`, 'i'), m => {
        r.repeat = { freq: 'weekly', interval: 1 };
        setDue(nextWeekday(today, dayIndex(m[1] || m[2]), true));
      })
      || take(/\b(daily|weekly|monthly|yearly|annually)\s*$/i, m => {
        const f = m[1].toLowerCase();
        r.repeat = { freq: f === 'annually' ? 'yearly' : f, interval: 1 };
      });

    // Times
    take(/\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s|[,.]|$)/i, m => {
      let h = +m[1];
      if (h < 1 || h > 12) return false;
      const pm = /^p/i.test(m[3]);
      if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
      r.time = `${pad(h)}:${pad(+(m[2] || 0))}`;
    })
      || take(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i, m => { r.time = `${pad(+m[1])}:${m[2]}`; })
      || take(/\bat\s+(\d{1,2})\b(?!\s*(?:\/|-|st|nd|rd|th))/i, m => {
        let h = +m[1];
        if (h > 23) return false;
        if (h >= 1 && h <= 6) h += 12; // "at 5" almost always means 5pm
        r.time = `${pad(h)}:00`;
      })
      || take(/\b(?:at\s+)?(noon|midday)\b/i, () => { r.time = '12:00'; });

    take(/\btonight\b/i, () => { setDue(today); if (!r.time) r.time = '20:00'; })
      || take(/\bthis\s+morning\b/i, () => { setDue(today); if (!r.time) r.time = '09:00'; })
      || take(/\bthis\s+evening\b/i, () => { setDue(today); if (!r.time) r.time = '18:00'; });

    // Dates
    const mkDate = (day, mon, year) => {
      const month = MONTHS[mon.slice(0, 3).toLowerCase()];
      const y = year ? +year : today.getFullYear();
      const d = new Date(y, month, day);
      if (day < 1 || d.getMonth() !== month) return false;
      if (!year && d < today) d.setFullYear(y + 1);
      setDue(d);
    };
    const dateRules = [
      [new RegExp(`\\b${PREFIX}(?:day\\s+after\\s+tomorrow|overmorrow)\\b`, 'i'), () => setDue(addDays(today, 2))],
      [new RegExp(`\\b${PREFIX}today\\b`, 'i'), () => setDue(today)],
      [new RegExp(`\\b${PREFIX}(?:tomorrow|tmrw?|tmw)\\b`, 'i'), () => setDue(addDays(today, 1))],
      [/\bin\s+(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|week|month|year)s?\b/i, m => {
        const n = /^\d+$/.test(m[1]) ? +m[1] : NUM_WORDS[m[1].toLowerCase()];
        const u = m[2].toLowerCase();
        setDue(u === 'day' ? addDays(today, n) : u === 'week' ? addDays(today, 7 * n) : addMonths(today, u === 'month' ? n : 12 * n));
      }],
      [new RegExp(`\\b${PREFIX}next\\s+(week|month|year)\\b`, 'i'), m => {
        const u = m[1].toLowerCase();
        setDue(u === 'week' ? nextWeekday(today, 1, false) : addMonths(today, u === 'month' ? 1 : 12));
      }],
      [/\b(this|next)\s+weekend\b/i, m => setDue(addDays(nextWeekday(today, 6, true), /next/i.test(m[1]) ? 7 : 0))],
      [new RegExp(`\\b(?:(?:on|by|due|for|this|next)\\s+)?${DAY_FULL_RE}\\b`, 'i'), m => setDue(nextWeekday(today, dayIndex(m[1]), false))],
      [new RegExp(`\\b(?:on|by|due|for|this|next)\\s+${DAY_ABBR_RE}\\b`, 'i'), m => setDue(nextWeekday(today, dayIndex(m[1]), false))],
      [new RegExp(`\\s${DAY_ABBR_RE}\\s*$`, 'i'), m => setDue(nextWeekday(today, dayIndex(m[1]), false))],
      [new RegExp(`\\b${PREFIX}(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:,?\\s+(\\d{4}))?`, 'i'), m => mkDate(+m[1], m[2], m[3])],
      [new RegExp(`\\b${PREFIX}${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'i'), m => mkDate(+m[2], m[1], m[3])],
      [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, m => {
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        if (d.getMonth() !== +m[2] - 1) return false;
        setDue(d);
      }],
      [new RegExp(`\\b${PREFIX}(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2}|\\d{4}))?\\b`, 'i'), m => {
        const [mo, da] = monthFirst ? [+m[1], +m[2]] : [+m[2], +m[1]];
        if (mo < 1 || mo > 12 || da < 1 || da > 31) return false;
        const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : today.getFullYear();
        const d = new Date(y, mo - 1, da);
        if (d.getMonth() !== mo - 1) return false;
        if (!m[3] && d < today) d.setFullYear(y + 1);
        setDue(d);
      }],
    ];
    for (const [re, fn] of dateRules) {
      if (r.due) break;
      take(re, fn);
    }

    // Repeating tasks need an anchor date
    if (r.repeat && !r.due) {
      let d = today;
      if (r.repeat.freq === 'weekdays') while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
      setDue(d);
    }
    if (r.time && !r.due) setDue(today);

    r.title = text.replace(/\s+/g, ' ').trim() || input.trim();
    return r;
  }

  global.DateUtil = { ymd, parseYmd, startOfDay, addDays, addMonths, nextWeekday };
  global.QuickParse = { parse };
})(window);
