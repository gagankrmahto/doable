// Cloud MCP function, offline: OAuth metadata, DCR, PKCE code flow, owner lock, bearer-protected MCP.
// Stubs firebase-admin (in-memory Firestore, fake ID tokens): node test/cloud-mcp.test.js
const assert = require('assert');
const crypto = require('node:crypto');
const Module = require('node:module');
const path = require('node:path');

// ---- stubs for firebase-admin and firebase-functions ----
const docs = new Map();
// Real Firestore rejects undefined values; mirror that so the stub catches it
const strict = (d, p) => { JSON.stringify(d, (k, v) => { if (v === undefined) throw new Error(`undefined value in field "${k}" of ${p}`); return v; }); return d; };
const fakeDb = {
  settings() {},
  doc: p => ({ path: p, get: async () => ({ exists: docs.has(p), data: () => docs.get(p), ref: { delete: async () => docs.delete(p) } }), set: async d => { docs.set(p, strict(d, p)); }, delete: async () => { docs.delete(p); } }),
  collection: name => ({ doc: id => ({ collection: sub => ({ get: async () => ({ docs: [...docs].filter(([k]) => k.startsWith(`${name}/${id}/${sub}/`)).map(([k, v]) => ({ id: k.split('/').pop(), data: () => v })) }), doc: did => ({ path: `${name}/${id}/${sub}/${did}` }) }) }) }),
  batch: () => { const ops = []; return { set: (ref, d) => ops.push([ref.path, strict(d, ref.path)]), commit: async () => { for (const [p, d] of ops) docs.set(p, d); } }; },
};
const OWNER = 'owner-uid-123';
const stubs = {
  'firebase-functions/v2/https': { onRequest: (opts, fn) => fn },
  'firebase-functions/params': { defineString: () => ({ value: () => OWNER + ',other-owner' }) },
  'firebase-admin/auth': { getAuth: () => ({ verifyIdToken: async tok => { if (tok === 'good-id-token') return { uid: OWNER }; if (tok === 'stranger') return { uid: 'someone-else' }; throw new Error('bad token'); } }) },
  'firebase-admin/firestore': { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => 'TS' } },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return stubs[request] ? request : origResolve.call(this, request, ...rest); };
const origLoad = Module._load;
Module._load = function (request, ...rest) { return stubs[request] || origLoad.call(this, request, ...rest); };

const fnDir = path.join(__dirname, '..', 'firebase', 'functions');
require('child_process').execSync('node scripts/prep-functions.js', { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
// The function has its own package; install it on a fresh checkout (CI) so express and the MCP SDK resolve
if (!require('fs').existsSync(path.join(fnDir, 'node_modules', 'express'))) {
  require('child_process').execSync('npm ci --ignore-scripts', { cwd: fnDir, stdio: 'ignore' });
}
const { mcp } = require(path.join(fnDir, 'mcp.js'));

// ---- a local HTTP host for the handler ----
const http = require('node:http');
const srv = http.createServer((req, res) => mcp(req, res)); // Express parses the body itself
const BASE = 'https://doable-gagan.web.app/mcp';

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const local = p => `http://127.0.0.1:${port}${p}`;
  const call = async (p, opt = {}) => {
    const r = await fetch(local(p), { redirect: 'manual', ...opt });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, headers: r.headers, text, json };
  };

  // 1. Metadata
  const prm = await call('/.well-known/oauth-protected-resource/mcp');
  assert.strictEqual(prm.status, 200);
  assert.ok(Array.isArray(prm.json.authorization_servers) && prm.json.authorization_servers.length === 1, 'has an authorization server');
  assert.ok(String(prm.json.resource).startsWith(BASE));
  const asm = await call('/.well-known/oauth-authorization-server');
  assert.strictEqual(asm.status, 200);
  assert.ok(asm.json.authorization_endpoint.endsWith('/authorize') && asm.json.token_endpoint.endsWith('/token') && asm.json.registration_endpoint.endsWith('/register'));
  assert.ok(asm.json.code_challenge_methods_supported.includes('S256'), 'PKCE advertised');

  // 2. Unauthenticated MCP call → 401 with WWW-Authenticate pointing at the metadata
  const un = await call('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.strictEqual(un.status, 401);
  assert.ok(/resource_metadata="https:\/\/doable-gagan\.web\.app\/\.well-known\/oauth-protected-resource\/mcp"/.test(un.headers.get('www-authenticate')), un.headers.get('www-authenticate'));

  // 3. Dynamic client registration
  const reg = await call('/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }) });
  assert.strictEqual(reg.status, 201, reg.text);
  const clientId = reg.json.client_id;

  // 4. Authorize → redirect to the Doable connect page carrying a request id
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', resource: BASE, scope: 'doable' });
  const az = await call('/authorize?' + q);
  assert.strictEqual(az.status, 302);
  const loc = az.headers.get('location');
  assert.ok(loc.startsWith('https://doable-gagan.web.app/connect.html#req='), loc);
  const reqId = loc.split('#req=')[1];

  // 5. A stranger's Google sign-in is refused; the owner's is accepted
  const bad = await call('/authorize/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ req: reqId, idToken: 'stranger' }) });
  assert.strictEqual(bad.status, 403);
  const ok = await call('/authorize/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ req: reqId, idToken: 'good-id-token' }) });
  assert.strictEqual(ok.status, 200, ok.text);
  const redirect = new URL(ok.json.redirect);
  assert.strictEqual(redirect.origin + redirect.pathname, 'https://claude.ai/api/mcp/auth_callback');
  assert.strictEqual(redirect.searchParams.get('state'), 'xyz');
  const code = redirect.searchParams.get('code');
  const again = await call('/authorize/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ req: reqId, idToken: 'good-id-token' }) });
  assert.strictEqual(again.status, 400, 'a request id is single-use');

  // 6. Token exchange with PKCE (wrong verifier fails, right one succeeds, code is single-use)
  const form = o => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });
  const wrong = await call('/token', form({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: 'nope', redirect_uri: 'https://claude.ai/api/mcp/auth_callback', resource: BASE }));
  assert.ok(wrong.status >= 400, 'wrong PKCE verifier rejected');
  const tok = await call('/token', form({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', resource: BASE }));
  assert.strictEqual(tok.status, 200, tok.text);
  assert.ok(tok.json.access_token && tok.json.refresh_token && tok.json.token_type === 'bearer');
  const reuse = await call('/token', form({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', resource: BASE }));
  assert.ok(reuse.status >= 400, 'code is single-use');

  // 7. Authenticated MCP: initialize + tools/list + a tool call that writes to the owner's records
  const auth = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer ' + tok.json.access_token };
  const init = await call('/mcp', { method: 'POST', headers: auth, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } }) });
  assert.strictEqual(init.status, 200, init.text);
  assert.strictEqual(init.json.result.serverInfo.name, 'doable');
  const list = await call('/mcp', { method: 'POST', headers: auth, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) });
  assert.strictEqual(list.json.result.tools.length, 10);
  docs.set(`users/${OWNER}/records/list:l1`, { kind: 'list', json: JSON.stringify({ id: 'l1', name: 'Inbox', pos: 0 }), deleted: false });
  const made = await call('/mcp', { method: 'POST', headers: auth, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_tasks', arguments: { tasks: [{ title: 'From the cloud' }] } } }) });
  const created = JSON.parse(made.json.result.content[0].text).created[0];
  assert.strictEqual(created.title, 'From the cloud');
  assert.ok(docs.has(`users/${OWNER}/records/task:${created.id}`), 'written under the owner uid');
  assert.ok(![...docs.keys()].some(k => k.startsWith('users/someone-else/')), 'never touches another user');

  // 8. Refresh rotates; a revoked/unknown token is 401
  const rf = await call('/token', form({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tok.json.refresh_token, resource: BASE }));
  assert.strictEqual(rf.status, 200, rf.text);
  assert.notStrictEqual(rf.json.access_token, tok.json.access_token);
  const stale = await call('/token', form({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tok.json.refresh_token, resource: BASE }));
  assert.ok(stale.status >= 400, 'old refresh token no longer works');
  const nope = await call('/mcp', { method: 'POST', headers: { ...auth, authorization: 'Bearer not-a-token' }, body: '{}' });
  assert.strictEqual(nope.status, 401);

  srv.close();
  console.log('cloud mcp tests passed');
})().catch(e => { console.error(e); process.exit(1); });
