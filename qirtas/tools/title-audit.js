// title-audit.js — audit every book title against its own source and against the
// rest of the catalogue. Offline: uses sourceUrl + catalogue data only.
//   node tools/title-audit.js            report
//   node tools/title-audit.js --fix      repair clear cases (recorded in audit_log)
'use strict';
const fs = require('fs');
const path = require('path');
const Q = path.resolve(__dirname, '..');
const CAT = path.join(Q, 'books-data', 'catalog.json');
const { DatabaseSync } = require('node:sqlite');
const { normKey } = require(path.join(Q, 'pipeline', 'lib', 'arabic.js'));
const FIX = process.argv.includes('--fix');

const catalog = JSON.parse(fs.readFileSync(CAT, 'utf8'));
const db = new DatabaseSync(path.join(Q, 'data', 'qirtas.db'));
const now = new Date().toISOString();

const ar = (s) => String(s || '').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '').replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
const slugify = (s) => ar(s).replace(/[^ء-ي0-9a-z ]/gi, ' ').replace(/\s+/g, '-');

function sourceName(url) {
  try {
    const u = new URL(url);
    if (/wikisource\.org$/.test(u.hostname)) {
      const seg = decodeURIComponent(u.pathname.replace('/wiki/', '')).replace(/_/g, ' ');
      return seg.split('/')[0].trim();
    }
    if (/archive\.org$/.test(u.hostname)) {
      const rest = decodeURIComponent(u.pathname.replace('/details/', '')).replace(/[_-]+/g, ' ');
      return rest.trim();
    }
    return '';
  } catch (e) { return ''; }
}

const issues = { mismatch: [], duplicates: [], latinInArabic: [], digitPrefix: [], punctuation: [], emptyAuthor: [] };
const byKey = new Map();

for (const b of catalog) {
  const title = (b.title && (b.title.ar || b.title.en)) || '';
  const author = (b.author && (b.author.ar || b.author.en)) || '';
  const key = normKey(String(title) + ' ' + author);
  if (byKey.has(key)) issues.duplicates.push({ id: b.id, title: title.slice(0, 60), other: byKey.get(key) });
  else byKey.set(key, b.id);

  if (/^\s*\d{1,4}\s/.test(title)) issues.digitPrefix.push({ id: b.id, title: title.slice(0, 60) });
  if (/[A-Za-z]/.test(title) && /[\u0600-\u06FF]/.test(title) && b.lang === 'ar') issues.latinInArabic.push({ id: b.id, title: title.slice(0, 60) });
  if (/[،.:;!؟\-\s]$/.test(title)) issues.punctuation.push({ id: b.id, title: title.slice(0, 60) });
  if (!author || author === 'مؤلف غير معروف') issues.emptyAuthor.push({ id: b.id, title: title.slice(0, 50) });

  const src = sourceName(b.sourceUrl || '');
  if (src && b.lang === 'ar') {
    const a = slugify(title), c = slugify(src);
    if (a && c && a !== c && !a.includes(c) && !c.includes(a)) {
      issues.mismatch.push({ id: b.id, title: title.slice(0, 70), source: src.slice(0, 70) });
    }
  }
}

console.log('books audited        : ' + catalog.length);
console.log('title vs source      : ' + issues.mismatch.length + ' differences');
issues.mismatch.slice(0, 12).forEach((x) => console.log('   - ' + x.id + '\n       title  : ' + x.title + '\n       source : ' + x.source));
console.log('duplicate titles     : ' + issues.duplicates.length);
issues.duplicates.slice(0, 8).forEach((x) => console.log('   - ' + x.id + ' == ' + x.other + '  (' + x.title + ')'));
console.log('digit prefixes       : ' + issues.digitPrefix.length);
issues.digitPrefix.slice(0, 8).forEach((x) => console.log('   - ' + x.id + ' : ' + x.title));
console.log('mixed latin+arabic   : ' + issues.latinInArabic.length);
issues.latinInArabic.slice(0, 8).forEach((x) => console.log('   - ' + x.id + ' : ' + x.title));
console.log('trailing punctuation : ' + issues.punctuation.length);
issues.punctuation.slice(0, 8).forEach((x) => console.log('   - ' + x.id + ' : ' + x.title));
console.log('unknown author       : ' + issues.emptyAuthor.length);

fs.mkdirSync(path.join(Q, 'cache'), { recursive: true });
fs.writeFileSync(path.join(Q, 'cache', 'title-audit.json'), JSON.stringify({ totals: { books: catalog.length }, issues }, null, 2));

if (FIX && issues.mismatch.length) {
  let n = 0;
  for (const x of issues.mismatch) {
    const src = x.source;
    // only repair when the source name is a clean Arabic title (no template junk)
    if (!src || /[{}|]/.test(src) || src.length < 4) continue;
    const row = db.prepare('select id, title, author, title_en from books where id = ?').get(x.id);
    if (!row) continue;
    const nk = normKey(src + ' ' + (row.author || ''));
    db.prepare('update books set title = ?, title_en = ?, search_key = ?, updated_at = ? where id = ?').run(src, src, nk, now, x.id);
    db.prepare('insert into audit_log (actor, action, target_type, target_id, details, created_at) values (?,?,?,?,?,?)')
      .run('maintenance', 'book.updated', 'book', x.id, JSON.stringify({ field: 'title', from: row.title, to: src, why: 'مطابقة العنوان مع اسم صفحة المصدر' }), now);
    n++;
    console.log('fixed title: ' + x.id + ' → ' + src);
  }
  console.log('titles repaired from source: ' + n);
}
