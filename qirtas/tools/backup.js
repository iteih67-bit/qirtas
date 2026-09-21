// Backup / restore / rollback helper for the Qirtas data layer.
// Usage:
//   node tools/backup.js create [label]   → backups/<timestamp>[-label]/  + manifest.json
//   node tools/backup.js list
//   node tools/backup.js restore <name>   → restores DB + catalogue (writes a safety backup first)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BACKUPS = path.join(ROOT, 'backups');
const ITEMS = [
  { src: path.join(ROOT, 'data', 'qirtas.db'), dest: 'qirtas.db' },
  { src: path.join(ROOT, 'books-data', 'catalog.json'), dest: 'catalog.json' },
  { src: path.join(ROOT, 'books-data', 'index.json'), dest: 'index.json' },
  { src: path.join(ROOT, 'books-data', 'external.json'), dest: 'external.json', optional: true },
  { src: path.join(ROOT, 'cache', 'license-audit.json'), dest: 'license-audit.json', optional: true },
];

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }
function exists(p) { try { fs.accessSync(p); return true; } catch (e) { return false; } }

function create(label) {
  const name = stamp() + (label ? '-' + label : '');
  const dir = path.join(BACKUPS, name);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { name, createdAt: new Date().toISOString(), files: [] };
  for (const it of ITEMS) {
    if (!exists(it.src)) { if (!it.optional) console.warn('  ! مفقود: ' + it.src); continue; }
    fs.copyFileSync(it.src, path.join(dir, it.dest));
    manifest.files.push({ file: it.dest, dest: it.dest, bytes: fs.statSync(it.src).size });
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('نسخة احتياطية: ' + dir);
  for (const f of manifest.files) console.log(`  ${f.dest}  ${(f.bytes / 1024).toFixed(0)} KB`);
  return dir;
}

function list() {
  if (!exists(BACKUPS)) return console.log('لا نسخ احتياطية بعد');
  for (const d of fs.readdirSync(BACKUPS).sort().reverse()) {
    const mf = path.join(BACKUPS, d, 'manifest.json');
    const m = exists(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : { files: [] };
    const size = m.files.reduce((n, f) => n + f.bytes, 0);
    console.log(`${d}  (${(size / 1048576).toFixed(1)} MB, ${m.files.length} ملفات)`);
  }
}

function restore(name) {
  const dir = path.join(BACKUPS, name);
  if (!exists(dir)) { console.error('نسخة غير موجودة: ' + name); process.exit(1); }
  console.log('→ إنشاء نسخة أمان قبل الاسترجاع…');
  create('pre-restore');
  for (const it of ITEMS) {
    const from = path.join(dir, it.dest);
    if (!exists(from)) continue;
    fs.mkdirSync(path.dirname(it.src), { recursive: true });
    fs.copyFileSync(from, it.src);
    console.log('  ✔ استُعيد: ' + it.dest);
  }
  console.log('تم الاسترجاع من ' + name + ' — أعد بناء الموقع: npm run site:build');
}

const cmd = process.argv[2] || 'list';
if (cmd === 'create') create(process.argv[3]);
else if (cmd === 'list') list();
else if (cmd === 'restore') restore(process.argv[3]);
else { console.error('usage: create [label] | list | restore <name>'); process.exit(2); }
