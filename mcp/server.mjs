#!/usr/bin/env node
// Doable MCP server: lets Claude (Claude Code, Claude Desktop) read and update your Doable directly.
// It signs in to Firebase as you and edits the same records the apps sync, so changes appear in the
// app within a second. Runs on your own machine; nothing new is hosted. See README.md for setup.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, writeBatch, serverTimestamp, getDocsFromServer } from 'firebase/firestore';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { registerTools } from './tools.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/* ---------- Config: Firebase web config from the app, credentials from the environment ---------- */
function loadFirebaseConfig() {
  const src = fs.readFileSync(path.join(here, '..', 'web', 'config.js'), 'utf8');
  const sandbox = { window: {} };
  new Function('window', src)(sandbox.window);
  const cfg = sandbox.window.DOABLE_CONFIG;
  if (!cfg || !cfg.firebase) throw new Error('web/config.js has no Firebase config');
  return cfg.firebase;
}
const EMAIL = process.env.DOABLE_EMAIL;
const PASSWORD = process.env.DOABLE_PASSWORD;
const PASSWORD_FILE = process.env.DOABLE_PASSWORD_FILE || path.join(os.homedir(), '.doable-mcp', 'password');
function password() {
  if (PASSWORD) return PASSWORD;
  try { return fs.readFileSync(PASSWORD_FILE, 'utf8').trim(); } catch { return ''; }
}

/* ---------- Data: a live mirror of users/{uid}/records ---------- */
const records = new Map(); // id -> { kind, data }
let ready = null;

let db, col;
async function connect() {
  if (ready) return ready;
  ready = (async () => {
    const app = initializeApp(loadFirebaseConfig());
    const auth = getAuth(app);
    if (!EMAIL || !password()) throw new Error('Set DOABLE_EMAIL and DOABLE_PASSWORD (or put the password in ~/.doable-mcp/password). See mcp/README.md.');
    const cred = await signInWithEmailAndPassword(auth, EMAIL, password());
    db = getFirestore(app);
    col = collection(db, 'users', cred.user.uid, 'records');
    const snap = await getDocsFromServer(col);
    for (const d of snap.docs) ingest(d.id, d.data());
    onSnapshot(col, s => { for (const c of s.docChanges()) if (!c.doc.metadata.hasPendingWrites) ingest(c.doc.id, c.doc.data()); }, () => {});
  })();
  return ready;
}
function ingest(id, x) {
  if (x.deleted || !x.json) records.delete(id);
  else records.set(id, { kind: x.kind, data: JSON.parse(x.json) });
}
async function write(rows) { // rows: [{ id, kind, data|null }]
  await connect();
  for (let i = 0; i < rows.length; i += 450) {
    const batch = writeBatch(db);
    for (const r of rows.slice(i, i + 450)) {
      batch.set(doc(col, r.id), { kind: r.kind, json: r.data ? JSON.stringify(r.data) : null, deleted: !r.data, updated_at: serverTimestamp() });
      if (r.data) records.set(r.id, { kind: r.kind, data: r.data }); else records.delete(r.id);
    }
    await batch.commit();
  }
}

const server = new McpServer({ name: 'doable', version: '1.0.0' });
registerTools(server, { records, write, connect });
const transport = new StdioServerTransport();
await server.connect(transport);
