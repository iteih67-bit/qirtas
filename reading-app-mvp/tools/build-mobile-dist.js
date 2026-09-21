// Builds a clean mobile-dist/ folder with only the web assets the app needs
// (no tools/, node_modules/, docs, or build scripts) — this is what Capacitor bundles.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'mobile-dist');

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

const FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'README.md'];
const DIRS = ['css', 'js', 'fonts', 'icons'];

for (const f of FILES) {
  fs.copyFileSync(path.join(ROOT, f), path.join(DEST, f));
}
for (const d of DIRS) {
  fs.cpSync(path.join(ROOT, d), path.join(DEST, d), { recursive: true });
}

console.log('mobile-dist/ built:', FILES.length, 'files +', DIRS.join(', '));
