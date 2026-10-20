// iCalendar reader tests: node test/ics.test.js  (runs as an Indian device would)
process.env.TZ = 'Asia/Kolkata';
const assert = require('assert');
require('../web/ics.js');
const { parseIcs, eventsBetween } = globalThis.Ics;

const ics = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:Gagan Work
BEGIN:VEVENT
UID:standup@x
SUMMARY:Team standup
DTSTART;TZID=Asia/Kolkata:20261019T093000
DTEND;TZID=Asia/Kolkata:20261019T094500
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
EXDATE;TZID=Asia/Kolkata:20261021T093000
DESCRIPTION:Join with Google Meet: https://meet.google.com/abc-defg-hij\\nOr dial in
END:VEVENT
BEGIN:VEVENT
UID:standup@x
RECURRENCE-ID;TZID=Asia/Kolkata:20261022T093000
SUMMARY:Team standup (moved)
DTSTART;TZID=Asia/Kolkata:20261022T110000
DTEND;TZID=Asia/Kolkata:20261022T111500
END:VEVENT
BEGIN:VEVENT
UID:standup@x
RECURRENCE-ID;TZID=Asia/Kolkata:20261023T093000
STATUS:CANCELLED
DTSTART;TZID=Asia/Kolkata:20261023T093000
END:VEVENT
BEGIN:VEVENT
UID:review@x
SUMMARY:Monthly review
DTSTART:20261013T083000Z
DURATION:PT1H
RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3
LOCATION:https://us02web.zoom.us/j/81234567890
END:VEVENT
BEGIN:VEVENT
UID:holiday@x
SUMMARY:Office closed
DTSTART;VALUE=DATE:20261102
DTEND;VALUE=DATE:20261103
END:VEVENT
BEGIN:VEVENT
UID:ny@x
SUMMARY:NY call
DTSTART;TZID=America/New_York:20261030T090000
DTEND;TZID=America/New_York:20261030T093000
RRULE:FREQ=WEEKLY;COUNT=2
END:VEVENT
BEGIN:VEVENT
UID:bday@x
SUMMARY:Mom's birthday
DTSTART;VALUE=DATE:19650315
RRULE:FREQ=YEARLY
END:VEVENT
END:VCALENDAR`;

const feed = parseIcs(ics);
assert.strictEqual(feed.name, 'Gagan Work');
const from = Date.parse('2026-10-19T00:00:00+05:30');
const to = Date.parse('2027-03-31T23:59:59+05:30');
const evs = eventsBetween(feed, from, to);
const local = ms => new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

// Weekday standup: Mon 19, Tue 20, (Wed 21 excluded), Thu 22 moved to 11:00, (Fri 23 cancelled), Mon 26…
const standups = evs.filter(e => e.uid === 'standup@x' && e.start < Date.parse('2026-10-27T00:00:00+05:30'));
assert.deepStrictEqual(standups.map(e => local(e.start)), ['19/10/2026, 09:30', '20/10/2026, 09:30', '22/10/2026, 11:00', '26/10/2026, 09:30']);
assert.strictEqual(standups[2].title, 'Team standup (moved)');
assert.strictEqual(standups[0].link, 'https://meet.google.com/abc-defg-hij');
assert.strictEqual(standups[0].end - standups[0].start, 15 * 60000);

// Monthly 2nd Tuesday, 3 times, in UTC: Oct 13 (before window), Nov 10, Dec 8 at 14:00 IST
const reviews = evs.filter(e => e.uid === 'review@x');
assert.deepStrictEqual(reviews.map(e => local(e.start)), ['10/11/2026, 14:00', '08/12/2026, 14:00']);
assert.ok(reviews[0].link.startsWith('https://us02web.zoom.us/j/'));

// All-day
const closed = evs.find(e => e.uid === 'holiday@x');
assert.ok(closed.allDay && local(closed.start).startsWith('02/11/2026'));

// New York 9:00 across the US DST change (Nov 1, 2026): 18:30 IST then 19:30 IST
const ny = evs.filter(e => e.uid === 'ny@x');
assert.deepStrictEqual(ny.map(e => local(e.start)), ['30/10/2026, 18:30', '06/11/2026, 19:30']);

// Yearly all-day birthday from 1965 shows in March 2027
assert.ok(evs.some(e => e.uid === 'bday@x' && local(e.start).startsWith('15/03/2027')));

console.log(`ics tests passed (${evs.length} events expanded)`);
