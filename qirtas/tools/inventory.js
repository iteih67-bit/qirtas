// inventory.js — read-only inventory of the project as it stands (no changes).
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = 'C:\\Users\\AsaadM\\Documents\\Books';
const Q = path.join(REPO, 'qirtas');
const A = path.join(REPO, 'reading-app-mvp');

const sizeOf = (dir) => {
  let bytes = 0, files = 0;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { bytes += fs.statSync(p).size; files++; }
    }
  })(dir);
  return { mb: +(bytes / 1048576).toFixed(1), files };
};

console.log('=== repository ===');
console.log('root: ' + REPO);
console.log('git HEAD: ' + execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim()
  + ' | branch ' + execSync('git branch --show-current', { cwd: REPO }).toString().trim()
  + ' | dirty files: ' + execSync('git status --porcelain', { cwd: REPO }).toString().trim().split('\n').filter(Boolean).length
  + ' | tracked: ' + execSync('git ls-files', { cwd: REPO }).toString().trim().split('\n').length);

console.log('\n=== top-level entries ===');
for (const e of fs.readdirSync(REPO, { withFileTypes: true })) {
  if (e.name === '.git') continue;
  const p = path.join(REPO, e.name);
  if (e.isDirectory()) { const s = sizeOf(p); console.log(`  ${e.name.padEnd(18)} dir   ${String(s.files).padStart(6)} files  ${String(s.mb).padStart(8)} MB`); }
  else console.log(`  ${e.name.padEnd(18)} file  ${String(Math.round(fs.statSync(p).size / 1024)).padStart(6)} KB`);
}

console.log('\n=== qirtas subsystems ===');
for (const sub of ['pipeline', 'pipeline/lib', 'site/tools', 'site/assets/js', 'site/assets/css', 'tools', 'docs', 'data', 'books-data', 'books-data/texts', 'backups', 'cache', 'site/dist']) {
  const p = path.join(Q, sub);
  if (!fs.existsSync(p)) { console.log(`  ${sub.padEnd(20)} MISSING`); continue; }
  const s = sizeOf(p);
  const js = fs.readdirSync(p).filter((f) => f.endsWith('.js')).length;
  console.log(`  ${sub.padEnd(20)} ${String(s.files).padStart(6)} files  ${String(s.mb).padStart(8)} MB  ${js} js`);
}

console.log('\n=== scripts (qirtas/package.json) ===');
const pkg = JSON.parse(fs.readFileSync(path.join(Q, 'package.json'), 'utf8'));
console.log('version ' + pkg.version + ' | dependencies: ' + JSON.stringify(pkg.dependencies || {}) + ' | devDependencies: ' + JSON.stringify(pkg.devDependencies || {}));
for (const [k, v] of Object.entries(pkg.scripts)) console.log('  ' + k.padEnd(20) + ' ' + v);

console.log('\n=== reading app ===');
const apkg = JSON.parse(fs.readFileSync(path.join(A, 'package.json'), 'utf8'));
console.log('scripts: ' + Object.keys(apkg.scripts || {}).join(', '));
console.log('books dir: ' + fs.readdirSync(path.join(A, 'books')).length + ' files, ' + sizeOf(path.join(A, 'books')).mb + ' MB');

console.log('\n=== docs ===');
for (const f of fs.readdirSync(path.join(Q, 'docs'))) console.log('  ' + f + '  ' + Math.round(fs.statSync(path.join(Q, 'docs', f)).size / 1024) + ' KB');

console.log('\n=== markers of unfinished work (TODO/FIXME/XXX/HACK) ===');
let markers = 0;
for (const dir of ['pipeline', 'pipeline/lib', 'site/tools', 'site/assets/js', 'tools', 'src']) {
  const p = path.join(Q, dir);
  if (!fs.existsSync(p)) continue;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const q = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(q); continue; }
      if (!/\.(js|css|html|md)$/.test(e.name)) continue;
      const txt = fs.readFileSync(q, 'utf8');
      const hits = txt.match(/\b(TODO|FIXME|XXX|HACK)\b/g);
      if (hits) { console.log('  ' + path.relative(Q, q) + ' → ' + hits.join(',')); markers += hits.length; }
    }
  })(p);
}
console.log('  total markers: ' + markers);
