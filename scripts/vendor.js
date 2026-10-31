// Copies browser bundles from node_modules into web/vendor so the app works offline (no CDN, no bundler at runtime).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'web', 'vendor');
const files = {
  'capacitor.js': 'node_modules/@capacitor/core/dist/capacitor.js',
};

fs.mkdirSync(out, { recursive: true });
for (const [name, src] of Object.entries(files)) {
  const from = path.join(root, src);
  const text = fs.readFileSync(from, 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/m, '');
  fs.writeFileSync(path.join(out, name), text);
  console.log(`vendor/${name}  ${(text.length / 1024).toFixed(0)} KB`);
}

// SDKs that ship as modules are bundled into single scripts:
// Firebase sets window.firebaseSdk, the Anthropic SDK sets window.Anthropic.
for (const [entry, name] of [['firebase-entry.mjs', 'firebase.js'], ['anthropic-entry.mjs', 'anthropic.js']]) {
  require('esbuild').buildSync({
    entryPoints: [path.join(__dirname, entry)],
    outfile: path.join(out, name),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    legalComments: 'none',
  });
  console.log(`vendor/${name}  ${(fs.statSync(path.join(out, name)).size / 1024).toFixed(0)} KB`);
}
