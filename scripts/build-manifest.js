// Writes web/version.json: what the Android app downloads to update itself without a new APK.
// Run before every hosting deploy (npm run deploy does). Build id = commit + time, so each deploy is distinct.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');
// The oldest APK (versionCode from the tag, MAJOR*10000+MINOR*100+PATCH) that can run this web bundle.
// Bump it when the web code starts needing a new native plugin or permission.
const MIN_NATIVE = 10012;

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const skip = /(^|[\\/])(version\.json|build\.js|sw\.js|\.DS_Store)$/;
const files = walk(web).filter(f => !skip.test(f)).map(f => {
  const rel = path.relative(web, f).split(path.sep).join('/');
  const buf = fs.readFileSync(f);
  return { path: rel, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}).sort((a, b) => a.path.localeCompare(b.path));

let commit = 'local';
try { commit = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
const now = new Date();
const build = `${now.toISOString().slice(0, 10).replace(/-/g, '')}.${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}-${commit}`;
fs.writeFileSync(path.join(web, 'build.js'), `window.DOABLE_BUILD = ${JSON.stringify({ build, builtAt: now.toISOString() })};
`);
files.push({ path: 'build.js', size: fs.statSync(path.join(web, 'build.js')).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(web, 'build.js'))).digest('hex') });
files.sort((a, b) => a.path.localeCompare(b.path));
const manifest = { v: 1, build, builtAt: now.toISOString(), minNative: MIN_NATIVE, files };
fs.writeFileSync(path.join(web, 'version.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`version.json: build ${build}, ${files.length} files, ${(files.reduce((s, f) => s + f.size, 0) / 1024).toFixed(0)} KB, minNative ${MIN_NATIVE}`);
