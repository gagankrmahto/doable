// Doable calendar proxy: lets the website read a calendar's secret iCal address.
// Browsers can't fetch Google's feed directly (no CORS headers); the Android app doesn't need this.
// Only signed-in Doable users, only well-known calendar hosts, read-only, nothing is stored or logged.
//
// Deploy (needs the Blaze plan):  npm run deploy:calendar
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

initializeApp();

const ALLOWED_HOSTS = [
  /^calendar\.google\.com$/,
  /^outlook\.(office365|live)\.com$/,
  /^outlook\.office\.com$/,
  /^p\d+-calendars?\.icloud\.com$/,
  /^calendar\.zoho\.(com|eu|in)$/,
  /^export\.calendar\.yahoo\.com$/,
];
const MAX_BYTES = 15 * 1024 * 1024;

function allowed(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    return ALLOWED_HOSTS.some(re => re.test(u.hostname.toLowerCase())) ? u : null;
  } catch {
    return null;
  }
}

exports.icsProxy = onRequest({ region: 'asia-south1', cors: true, maxInstances: 3, memory: '256MiB', timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }

  const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  try {
    await getAuth().verifyIdToken(token);
  } catch {
    res.status(401).json({ error: 'Sign in to Doable to load calendars' });
    return;
  }

  let target = allowed(String((req.body && req.body.url) || ''));
  if (!target) { res.status(400).json({ error: 'Only Google, Outlook, iCloud, Zoho and Yahoo calendar addresses are supported' }); return; }

  // Follow redirects by hand so every hop stays on an allowed host
  let upstream = null;
  for (let hop = 0; hop < 4; hop++) {
    upstream = await fetch(target, {
      redirect: 'manual',
      headers: { Accept: 'text/calendar, */*;q=0.5', 'User-Agent': 'Doable calendar sync' },
      signal: AbortSignal.timeout(20000),
    });
    if (upstream.status < 300 || upstream.status >= 400) break;
    const next = upstream.headers.get('location');
    const nextUrl = next ? allowed(new URL(next, target).href) : null;
    if (!nextUrl) { res.status(502).json({ error: 'The calendar redirected somewhere unexpected' }); return; }
    target = nextUrl;
  }
  if (!upstream || !upstream.ok) {
    const status = upstream ? upstream.status : 502;
    res.status(status === 404 ? 404 : 502).json({ error: status === 404 ? 'Address not found — copy it again from your calendar settings' : `The calendar server said ${status}` });
    return;
  }

  // Read with a size cap
  const reader = upstream.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) { await reader.cancel(); res.status(413).json({ error: 'That calendar is too large' }); return; }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
  if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) { res.status(422).json({ error: 'That address didn’t return a calendar — use the iCal (.ics) address' }); return; }

  res.set('Cache-Control', 'no-store').type('text/calendar; charset=utf-8').send(text);
});
