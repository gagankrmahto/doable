// In-app updater: manifest decisions with a stubbed native plugin: node test/update.test.js
const assert = require('assert');
const calls = [];
const plugin = {
  current: async () => ({ versionName: '1.0.12', versionCode: 10012, activeBuild: null, previousBuild: null, bootCount: 0 }),
  booted: async () => ({ bootCount: 1 }),
  download: async args => { calls.push(['download', args.build, args.files.length]); },
  apply: async () => calls.push(['apply']),
  ready: async () => calls.push(['ready']),
  rollback: async () => calls.push(['rollback']),
};
let manifest = null;
globalThis.window = globalThis;
globalThis.Capacitor = { isNativePlatform: () => true, registerPlugin: () => plugin };
globalThis.DOABLE_CONFIG = { siteUrl: 'https://doable-gagan.web.app/' };
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };
globalThis.navigator = { onLine: true };
globalThis.location = { reload() { calls.push(['reload']); } };
globalThis.setInterval = () => 0;
globalThis.fetch = async () => ({ ok: !!manifest, json: async () => manifest });
require('../web/update.js');
const U = globalThis.DoableUpdate;

(async () => {
  const states = [];
  await U.init({ onState: s => states.push(s) });
  assert.strictEqual(U.state().running.versionCode, 10012);
  assert.strictEqual(U.state().staged, null, 'no manifest: nothing staged');

  // Same build as running: nothing to do
  globalThis.DOABLE_BUILD = { build: 'B1' };
  manifest = { v: 1, build: 'B1', minNative: 10012, files: [{ path: 'app.js', sha256: 'x' }] };
  await U.check({ force: true });
  assert.strictEqual(calls.filter(c => c[0] === 'download').length, 0);

  // Newer build within the native range: downloaded and staged
  manifest = { v: 1, build: 'B2', builtAt: '2026-11-02T00:00:00Z', minNative: 10012, files: [{ path: 'app.js', sha256: 'x' }, { path: 'index.html', sha256: 'y' }] };
  await U.check({ force: true });
  assert.deepStrictEqual(calls.filter(c => c[0] === 'download').pop(), ['download', 'B2', 2]);
  assert.strictEqual(U.state().staged.build, 'B2');
  await U.check({ force: true });
  assert.strictEqual(calls.filter(c => c[0] === 'download').length, 1, 'an already staged build is not downloaded twice');

  // Needs a newer APK: not downloaded, flagged with the releases link
  manifest = { v: 1, build: 'B3', minNative: 10100, files: [{ path: 'app.js', sha256: 'x' }] };
  await U.check({ force: true });
  assert.strictEqual(calls.filter(c => c[0] === 'download').length, 1);
  assert.strictEqual(U.state().nativeNeeded.minNative, 10100);
  assert.ok(U.state().nativeNeeded.releases.includes('github.com'));

  // Restart now applies and reloads; health mark reports ready only on a downloaded bundle
  await U.applyNow();
  assert.deepStrictEqual(calls.slice(-2), [['apply'], ['reload']]);
  await U.markHealthy();
  assert.ok(!calls.some(c => c[0] === 'ready'), 'running the APK-built-in bundle: nothing to confirm');
  console.log('update tests passed');
})().catch(e => { console.error(e); process.exit(1); });
