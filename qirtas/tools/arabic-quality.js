// arabic-quality.js — audit (and optionally repair) Arabic metadata and text quality.
//   node tools/arabic-quality.js            report only
//   node tools/arabic-quality.js --fix      hide books whose text is unusable, log to audit_log
'use strict';
const fs = require('fs');
const path = require('path');
const Q = path.resolve(__dirname, '..');
const metadata = require(path.join(Q, 'pipeline', 'lib', 'metadata.js'));
const arabicWordRatio = metadata.arabicWordRatio;
const DIST = path.join(Q, 'site', 'dist');
const { DatabaseSync } = require('node:sqlite');
const FIX = process.argv.includes('--fix');

const db = new DatabaseSync(path.join(Q, 'data', 'qirtas.db'));
const rows = db.prepare('select id, title, author, language, words, source_key, source_url, file_path from books').all();

const AR = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]/;
function arTokens(s) { return String(s || '').split(/\s+/).filter(Boolean); }

const textCache = new Map();
function textOf(id) {
  if (textCache.has(id)) return textCache.get(id);
  let p = path.join(DIST, 'books', id + '.json');
  if (!fs.existsSync(p)) p = path.join(Q, 'books-data', 'texts', id + '.json'); // fall back to the source texts
  let txt = '';
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    txt = (j.chapters || []).map((c) => (c.paragraphs || []).join(' ')).join(' ');
  } catch (e) { txt = ''; }
  textCache.set(id, txt);
  return txt;
}

const report = { total: rows.length, junkTitles: [], placeholderAuthors: [], lowQualityText: [], latinTitlesInArabic: [], unreadable: [] };
const BAD_TITLE = /^\s*[|\d]|^\s*[A-Za-z]{1,3}\s*$|[{}]/;

for (const r of rows) {
  const title = String(r.title || '').trim();
  if (BAD_TITLE.test(title)) report.junkTitles.push({ id: r.id, title: title.slice(0, 60) });
  if (/^(مؤلف تراثي|مؤلف غير محدد|Unknown author|مجهول)$/.test(String(r.author || '').trim())) report.placeholderAuthors.push({ id: r.id, author: r.author, title: title.slice(0, 50) });
  if (r.language === 'ar' && !AR.test(title) && LATIN.test(title)) report.latinTitlesInArabic.push({ id: r.id, title: title.slice(0, 60) });
  if (r.language === 'ar') {
    const txt = textOf(r.id);
    if (!txt) { report.unreadable.push({ id: r.id, title: title.slice(0, 40) }); continue; } // never hide what we could not read
    const ratio = arabicWordRatio(txt);
    if (metadata.qualityVerdict(ratio) === 'unusable') report.lowQualityText.push({ id: r.id, ratio: +ratio.toFixed(3), words: r.words, title: title.slice(0, 50), source: r.source_key });
  }
}

console.log('books scanned            : ' + report.total);
console.log('junk titles              : ' + report.junkTitles.length);
report.junkTitles.slice(0, 12).forEach((x) => console.log('   - ' + x.id + ' :: ' + x.title));
console.log('placeholder authors      : ' + report.placeholderAuthors.length);
report.placeholderAuthors.slice(0, 8).forEach((x) => console.log('   - ' + x.id + ' :: ' + x.title));
console.log('arabic titles with latin : ' + report.latinTitlesInArabic.length);
report.latinTitlesInArabic.slice(0, 8).forEach((x) => console.log('   - ' + x.id + ' :: ' + x.title));
console.log('low-quality arabic text  : ' + report.lowQualityText.length);
const reviewBand = rows.filter((r) => r.language === 'ar' && r.hidden !== 1).map((r) => ({ id: r.id, ratio: +metadata.arabicWordRatio(textOf(r.id)).toFixed(3) })).filter((x) => metadata.qualityVerdict(x.ratio) === 'review');
console.log('needs review (borderline): ' + reviewBand.length);
console.log('text not found on disk    : ' + report.unreadable.length);
report.lowQualityText.slice(0, 15).forEach((x) => console.log('   - ' + x.id + ' ratio=' + x.ratio + ' words=' + x.words + ' :: ' + x.title + ' [' + x.source + ']'));

fs.mkdirSync(path.join(Q, 'cache'), { recursive: true });
fs.writeFileSync(path.join(Q, 'cache', 'arabic-quality.json'), JSON.stringify(report, null, 2));

if (FIX && report.lowQualityText.length) {
  const now = new Date().toISOString();
  let hidden = 0;
  for (const x of report.lowQualityText) {
    db.prepare('update books set hidden = 1, removed_reason = ?, updated_at = ? where id = ?')
      .run('نص مشوّه من التعرّف الضوئي (نسبة الكلمات العربية الصحيحة ' + x.ratio + ')', now, x.id);
    db.prepare('insert into audit_log (actor, action, target_type, target_id, details, created_at) values (?,?,?,?,?,?)')
      .run('maintenance', 'book.hidden', 'book', x.id, JSON.stringify({ reason: 'low_ocr_quality', arabicWordRatio: x.ratio, words: x.words }), now);
    hidden++;
  }
  console.log('\nFIX: ' + hidden + ' book(s) hidden for unusable text quality (audit_log entries written)');
}
