/* Doable — in-app updates for the Android build.
 * Web updates: on launch and resume, compare the website's version.json with the running bundle; download a
 * newer one in the background (hashes verified natively), then offer "Restart to update" or apply on the next
 * cold start. First boots of a new bundle are counted; if the app doesn't report healthy within 3 boots, the
 * previous bundle is restored, so a bad release can't lock you out.
 * Native updates: when version.json needs a newer APK than installed, point at GitHub Releases instead. */
(function (global) {
  'use strict';

  const CHECK_EVERY = 30 * 60000;
  const RELEASES = 'https://github.com/gagankrmahto/doable/releases/latest';
  let plugin = null;
  let site = '';
  let hooks = {};
  let lastCheck = 0;
  let running = null; // { build, versionName, versionCode }
  let staged = null;  // manifest downloaded and ready to apply
  let nativeNeeded = null; // manifest that needs a newer APK

  const buildOf = () => (global.DOABLE_BUILD && global.DOABLE_BUILD.build) || null;

  async function init(opts) {
    hooks = opts || {};
    const Cap = global.Capacitor;
    if (!(Cap && Cap.isNativePlatform && Cap.isNativePlatform())) return; // the website updates itself through the service worker
    site = ((global.DOABLE_CONFIG || {}).siteUrl || '').replace(/\/$/, '');
    if (!site) return;
    plugin = Cap.registerPlugin('LiveUpdate');
    try {
      const cur = await plugin.current();
      running = { build: cur.activeBuild || 'apk', versionName: cur.versionName, versionCode: cur.versionCode };
      // Health: count this boot; the app calls markHealthy() once it has rendered and synced
      if (cur.activeBuild) {
        const { bootCount } = await plugin.booted();
        if (bootCount > 3 && cur.previousBuild !== null && cur.previousBuild !== '') {
          await plugin.rollback();
          hooks.onMessage && hooks.onMessage('The last update didn’t start properly, so the previous version was restored.');
          location.reload();
          return;
        }
      }
    } catch (e) { console.warn('LiveUpdate unavailable', e); plugin = null; return; }
    check();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, CHECK_EVERY);
  }

  async function markHealthy() {
    if (plugin && running && running.build !== 'apk') { try { await plugin.ready(); } catch { /* ignore */ } }
  }

  async function check({ force } = {}) {
    if (!plugin || (!force && Date.now() - lastCheck < 60000) || navigator.onLine === false) return state();
    lastCheck = Date.now();
    let m;
    try {
      const r = await fetch(`${site}/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return state();
      m = await r.json();
    } catch { return state(); }
    if (!m || m.v !== 1 || !m.build || !Array.isArray(m.files)) return state();
    const current = buildOf() || running.build;
    if (m.build === current || (staged && staged.build === m.build)) return state();
    if (m.minNative && running.versionCode && running.versionCode < m.minNative) {
      nativeNeeded = m;
      hooks.onState && hooks.onState(state());
      return state();
    }
    try {
      await plugin.download({ build: m.build, baseUrl: site + '/', files: m.files.map(f => ({ path: f.path, sha256: f.sha256 })) });
      staged = m;
      hooks.onState && hooks.onState(state());
    } catch (e) { console.warn('Update download failed', e); }
    return state();
  }

  async function applyNow() {
    if (!plugin || !staged) return;
    await plugin.apply();
    location.reload();
  }
  // Apply quietly when the app goes to the background, so the next open is already updated
  function applyWhenHidden() {
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'hidden' && staged && plugin) { try { await plugin.apply(); staged = null; } catch { /* next time */ } }
    });
  }

  const state = () => ({ native: !!plugin, running, staged: staged && { build: staged.build, builtAt: staged.builtAt }, nativeNeeded: nativeNeeded && { minNative: nativeNeeded.minNative, releases: RELEASES } });

  global.DoableUpdate = { init, check, applyNow, applyWhenHidden, markHealthy, state, RELEASES };
})(typeof window !== 'undefined' ? window : globalThis);
