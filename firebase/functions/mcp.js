// Doable cloud MCP server: lets Claude on your phone, claude.ai or any computer use your Doable.
// One Cloud Function serves the OAuth 2.1 authorization server (Dynamic Client Registration, PKCE,
// RFC 8707 resource binding) and the MCP endpoint. Sign-in is the Doable site's Google login; only
// the account whose UID is in OWNER_UIDS is ever issued a token, so nobody else can connect.
const { onRequest } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Owner UIDs, comma-separated (Firebase console → Authentication → Users → User UID). Set once at deploy.
const OWNER_UIDS = defineString('DOABLE_OWNER_UIDS', { description: 'Firebase Auth UIDs allowed to use the MCP server, comma-separated' });
// Served through Firebase Hosting rewrites, so discovery lives at the site root and the MCP URL is short
const SITE = 'https://doable-gagan.web.app';
const BASE = `${SITE}/mcp`;
const TOKEN_TTL = 3600;              // access token lifetime, seconds
const REFRESH_TTL = 180 * 86400;     // refresh token lifetime
const CODE_TTL = 600;                // authorization code lifetime

let mod = null; // the MCP SDK is ESM; load it once per instance
async function sdk() {
  if (mod) return mod;
  const [mcp, http, router, bearer, types, errors] = await Promise.all([
    import('@modelcontextprotocol/sdk/server/mcp.js'),
    import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
    import('@modelcontextprotocol/sdk/server/auth/router.js'),
    import('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'),
    import('@modelcontextprotocol/sdk/types.js'),
    import('@modelcontextprotocol/sdk/server/auth/errors.js'),
  ]);
  const tools = await import(pathToFileURL(path.join(__dirname, 'tools.mjs')).href);
  mod = { ...mcp, ...http, ...router, ...bearer, ...types, ...errors, registerTools: tools.registerTools };
  return mod;
}
// OAuth errors the SDK maps to proper statuses (401 for bad tokens, 400 for bad grants) instead of a 500
const badGrant = msg => new mod.InvalidGrantError(msg);
process.on('unhandledRejection', e => console.error('unhandledRejection:', e && e.stack ? e.stack : e));
const badToken = msg => new mod.InvalidTokenError(msg);

let _db = null;
function db() {
  if (!_db) { _db = getFirestore(); try { _db.settings({ ignoreUndefinedProperties: true }); } catch { /* already configured */ } }
  return _db;
}
// Firestore rejects `undefined` values; the OAuth SDK hands us records with optional fields unset
const clean = o => JSON.parse(JSON.stringify(o));
const rnd = n => crypto.randomBytes(n).toString('base64url');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const owners = () => OWNER_UIDS.value().split(',').map(s => s.trim()).filter(Boolean);

/* ---------- OAuth provider backed by Firestore (oauth/* is admin-only; clients can't read it) ---------- */
const clientsStore = {
  async getClient(id) { const d = await db().doc(`oauth/client_${id}`).get(); return d.exists ? d.data() : undefined; },
  async registerClient(c) {
    const client = clean({ ...c, client_id: rnd(16), client_id_issued_at: Math.floor(Date.now() / 1000) });
    await db().doc(`oauth/client_${client.client_id}`).set(client);
    return client;
  },
};
const provider = {
  clientsStore,
  // Step 1: remember the request, send the person to the Doable site to sign in with Google
  async authorize(client, params, res) {
    const id = rnd(24);
    await db().doc(`oauth/req_${id}`).set(clean({ clientId: client.client_id, ...params, resource: params.resource ? params.resource.href : null, exp: Date.now() + CODE_TTL * 1000 }));
    res.redirect(`${SITE}/connect.html#req=${id}`);
  },
  async challengeForAuthorizationCode(client, code) {
    const d = await db().doc(`oauth/code_${sha(code)}`).get();
    if (!d.exists || d.data().clientId !== client.client_id || d.data().exp < Date.now()) throw badGrant('Invalid or expired authorization code');
    return d.data().codeChallenge;
  },
  async exchangeAuthorizationCode(client, code, _verifier, redirectUri, resource) {
    const ref = db().doc(`oauth/code_${sha(code)}`);
    const d = await ref.get();
    const c = d.exists ? d.data() : null;
    if (!c || c.clientId !== client.client_id || c.exp < Date.now()) throw badGrant('Invalid or expired authorization code');
    if (redirectUri && c.redirectUri !== redirectUri) throw badGrant('redirect_uri mismatch');
    if (resource && c.resource && resource.href !== c.resource) throw badGrant('resource mismatch');
    await ref.delete(); // single use
    return issueTokens(client.client_id, c.uid, c.scopes || []);
  },
  async exchangeRefreshToken(client, refreshToken, scopes) {
    const ref = db().doc(`oauth/refresh_${sha(refreshToken)}`);
    const d = await ref.get();
    const r = d.exists ? d.data() : null;
    if (!r || r.clientId !== client.client_id || r.exp < Date.now()) throw badGrant('Invalid refresh token');
    await ref.delete(); // rotate
    return issueTokens(client.client_id, r.uid, scopes && scopes.length ? scopes : r.scopes || []);
  },
  async verifyAccessToken(token) {
    const d = await db().doc(`oauth/token_${sha(token)}`).get();
    if (!d.exists || d.data().exp < Date.now()) throw badToken('Invalid or expired token');
    const t = d.data();
    if (!owners().includes(t.uid)) throw badToken('Not the owner');
    return { token, clientId: t.clientId, scopes: t.scopes || [], expiresAt: Math.floor(t.exp / 1000), resource: new URL(BASE), extra: { uid: t.uid } };
  },
  async revokeToken(client, { token }) {
    for (const k of ['token', 'refresh']) { const ref = db().doc(`oauth/${k}_${sha(token)}`); const d = await ref.get(); if (d.exists && d.data().clientId === client.client_id) await ref.delete(); }
  },
};
for (const [obj, label] of [[provider, 'oauth'], [clientsStore, 'clients']]) {
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] !== 'function') continue;
    const fn = obj[k];
    obj[k] = async function (...args) { try { return await fn.apply(this, args); } catch (e) { console.error(`${label} ${k} failed:`, e && e.stack ? e.stack : e); throw e; } };
  }
}
async function issueTokens(clientId, uid, scopes) {
  const access = rnd(32), refresh = rnd(32);
  await db().doc(`oauth/token_${sha(access)}`).set({ clientId, uid, scopes, exp: Date.now() + TOKEN_TTL * 1000 });
  await db().doc(`oauth/refresh_${sha(refresh)}`).set({ clientId, uid, scopes, exp: Date.now() + REFRESH_TTL * 1000 });
  return { access_token: access, token_type: 'bearer', expires_in: TOKEN_TTL, refresh_token: refresh, scope: scopes.join(' ') };
}

/* ---------- Per-request record store over the Admin SDK (same shapes as the apps) ---------- */
function storeFor(uid) {
  const records = new Map();
  const col = db().collection('users').doc(uid).collection('records');
  let loaded = null;
  return {
    records,
    connect: () => (loaded = loaded || col.get().then(snap => { for (const d of snap.docs) { const x = d.data(); if (!x.deleted && x.json) records.set(d.id, { kind: x.kind, data: JSON.parse(x.json) }); } })),
    async write(rows) {
      for (let i = 0; i < rows.length; i += 450) {
        const batch = db().batch();
        for (const r of rows.slice(i, i + 450)) {
          batch.set(col.doc(r.id), { kind: r.kind, json: r.data ? JSON.stringify(r.data) : null, deleted: !r.data, updated_at: FieldValue.serverTimestamp() });
          if (r.data) records.set(r.id, { kind: r.kind, data: r.data }); else records.delete(r.id);
        }
        await batch.commit();
      }
    },
  };
}

/* ---------- The app ---------- */
let appPromise = null;
async function buildApp() {
  const m = await sdk();
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => { // CORS for browser-based clients (claude.ai)
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'authorization, content-type, mcp-session-id, mcp-protocol-version');
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.set('Access-Control-Expose-Headers', 'mcp-session-id, www-authenticate');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  });
  // Hosting rewrites pass the original path (/mcp, /mcp/authorize, /.well-known/...), which is what the router expects
  app.use(m.mcpAuthRouter({
    provider, issuerUrl: new URL(SITE), baseUrl: new URL(SITE), resourceServerUrl: new URL(BASE), // auth endpoints at the site root, the MCP resource at /mcp
    resourceName: 'Doable', serviceDocumentationUrl: new URL('https://github.com/gagankrmahto/doable/blob/main/mcp/USING-WITH-CLAUDE.md'),
    scopesSupported: ['doable'],
    authorizationOptions: { rateLimit: false }, tokenOptions: { rateLimit: false }, clientRegistrationOptions: { rateLimit: false, clientSecretExpirySeconds: 0 },
  }));

  // Step 2: the Doable site posts back a Firebase ID token; only an owner gets an authorization code
  app.post('/authorize/complete', async (req, res) => {
    try {
      const { req: id, idToken } = req.body || {};
      const d = await db().doc(`oauth/req_${id}`).get();
      if (!d.exists || d.data().exp < Date.now()) { res.status(400).json({ error: 'This sign-in link has expired. Start again from Claude.' }); return; }
      const decoded = await getAuth().verifyIdToken(String(idToken || ''), true);
      if (!owners().includes(decoded.uid)) { res.status(403).json({ error: 'This Doable belongs to someone else.' }); return; }
      const r = d.data();
      const code = rnd(32);
      await db().doc(`oauth/code_${sha(code)}`).set(clean({ clientId: r.clientId, uid: decoded.uid, codeChallenge: r.codeChallenge, redirectUri: r.redirectUri, resource: r.resource || null, scopes: r.scopes || [], exp: Date.now() + CODE_TTL * 1000 }));
      await d.ref.delete();
      const u = new URL(r.redirectUri);
      u.searchParams.set('code', code);
      if (r.state) u.searchParams.set('state', r.state);
      res.json({ redirect: u.href });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Could not complete sign-in' });
    }
  });

  // The MCP endpoint: stateless, one transport per request, authenticated by bearer token
  const guard = m.requireBearerAuth({ verifier: provider, resourceMetadataUrl: `${SITE}/.well-known/oauth-protected-resource/mcp`, expectedResource: new URL(BASE) });
  const handle = async (req, res) => {
    const server = new m.McpServer({ name: 'doable', version: '1.0.0' });
    m.registerTools(server, storeFor(req.auth.extra.uid));
    const transport = new m.StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };
  app.post('/mcp', guard, handle);
  app.get('/mcp', guard, (req, res) => { res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Use POST' }, id: null }); });
  app.delete('/mcp', guard, (req, res) => { res.status(200).end(); });
  app.get('/mcp/health', (req, res) => { res.json({ ok: true, service: 'doable-mcp' }); });
  // Last resort: log the stack so Cloud Logging shows what failed (the SDK's handlers only say "server_error")
  app.use((err, req, res, _next) => {
    console.error(`unhandled on ${req.method} ${req.path}:`, err && err.stack ? err.stack : err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'server_error', error_description: (err && err.message) || 'Internal Server Error' });
  });
  return app;
}

exports.mcp = onRequest({ region: 'asia-south1', maxInstances: 2, memory: '256MiB', timeoutSeconds: 60, concurrency: 20 }, async (req, res) => {
  appPromise = appPromise || buildApp();
  (await appPromise)(req, res);
});
