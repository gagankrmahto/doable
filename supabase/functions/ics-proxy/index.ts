// Doable calendar proxy — lets the website read a calendar's iCal feed.
// Browsers can't fetch Google's feed directly (no CORS headers); the Android app doesn't need this.
// Only signed-in Doable users, only well-known calendar hosts, read-only, nothing is stored or logged.
//
// Deploy:  supabase functions deploy ics-proxy

const ALLOWED_HOSTS = [
  /^calendar\.google\.com$/,
  /^outlook\.(office365|live)\.com$/,
  /^outlook\.office\.com$/,
  /^p\d+-calendars?\.icloud\.com$/,
  /^calendar\.zoho\.(com|eu|in)$/,
  /^export\.calendar\.yahoo\.com$/,
];
const MAX_BYTES = 15 * 1024 * 1024;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function allowed(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    return ALLOWED_HOSTS.some(re => re.test(u.hostname.toLowerCase())) ? u : null;
  } catch {
    return null;
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  // The gateway accepts any project JWT (including the public anon key), so confirm a real signed-in user.
  const auth = req.headers.get('Authorization') || '';
  const apikey = Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || '';
  const who = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  if (!who.ok) return json({ error: 'Sign in to Doable to load calendars' }, 401);

  const body = await req.json().catch(() => ({}));
  let target = allowed(String(body.url || ''));
  if (!target) return json({ error: 'Only Google, Outlook, iCloud, Zoho and Yahoo calendar addresses are supported' }, 400);

  // Follow redirects by hand so every hop stays on an allowed host
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(target, {
      redirect: 'manual',
      headers: { Accept: 'text/calendar, */*;q=0.5', 'User-Agent': 'Doable calendar sync' },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status < 300 || res.status >= 400) break;
    const next = res.headers.get('location');
    const nextUrl = next ? allowed(new URL(next, target).href) : null;
    if (!nextUrl) return json({ error: 'The calendar redirected somewhere unexpected' }, 502);
    target = nextUrl;
  }
  if (!res || !res.ok) {
    const status = res ? res.status : 502;
    return json({ error: status === 404 ? 'Address not found — copy it again from your calendar settings' : `The calendar server said ${status}` }, status === 404 ? 404 : 502);
  }

  // Read with a size cap
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) { await reader.cancel(); return json({ error: 'That calendar is too large' }, 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }
  const text = new TextDecoder().decode(bytes);
  if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) return json({ error: 'That address didn’t return a calendar — use the iCal (.ics) address' }, 422);

  return new Response(text, { headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } });
});
