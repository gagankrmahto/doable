// Copies browser bundles from node_modules into web/vendor so the app works offline (no CDN, no bundler at runtime).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'web', 'vendor');
const files = {
  'supabase.js': 'node_modules/@supabase/supabase-js/dist/umd/supabase.js',
  'capacitor.js': 'node_modules/@capacitor/core/dist/capacitor.js',
};

fs.mkdirSync(out, { recursive: true });
for (const [name, src] of Object.entries(files)) {
  const from = path.join(root, src);
  const text = fs.readFileSync(from, 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/m, '');
  fs.writeFileSync(path.join(out, name), text);
  console.log(`vendor/${name}  ${(text.length / 1024).toFixed(0)} KB`);
}

// The Anthropic SDK ships as modules, so bundle it into one script that sets window.Anthropic
require('esbuild').buildSync({
  entryPoints: [path.join(__dirname, 'anthropic-entry.mjs')],
  outfile: path.join(out, 'anthropic.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
});
console.log(`vendor/anthropic.js  ${(fs.statSync(path.join(out, 'anthropic.js')).size / 1024).toFixed(0)} KB`);
