// enrich-arabic.js — repair Arabic titles and fill in missing authors from the source page.
//   node tools/enrich-arabic.js --titles     strip leaked series numbers, name periodical issues
//   node tools/enrich-arabic.js --authors     fetch the source page and read the author field
//   node tools/enrich-arabic.js --all
'use strict';
const fs = require('fs');
const path = require('path');
const Q = path.resolve(__dirname, '..');
const { DatabaseSync } = require('node:sqlite');
const { normKey } = require(path.join(Q, 'pipeline', 'lib', 'arabic.js'));
const { fetchPolite } = require(path.join(Q, 'pipeline', 'lib', 'common.js'));

const db = new DatabaseSync(path.join(Q, 'data', 'qirtas.db'));
const NOW = new Date().toISOString();
const log = (m) => console.log(m);
const audit = (id, details) => db.prepare('insert into audit_log (actor, action, target_type, target_id, details, created_at) values (?,?,?,?,?,?)')
  .run('maintenance', 'book.updated', 'book', id, JSON.stringify(details), NOW);

// ---------- 1) titles ----------
function fixTitles() {
  const rows = db.prepare("select id, title, author, source_url from books where language = 'ar'").all();
  let n = 0;
  for (const r of rows) {
    let t = String(r.title || '').trim();
    const m = t.match(/^(\d{1,4})\s+(.*)$/);
    if (!m) continue;
    const num = m[1];
    let rest = m[2].trim();
    let next;
    if (/مجلة|صحيفة|جريدة|رسالة|الفيصل|الهلال/.test(rest) || /magazine|journal/i.test(rest)) {
      next = `${rest} — العدد ${num}`;
    } else {
      next = rest; // a leaked series number: drop it
    }
    if (next === t) continue;
    db.prepare('update books set title = ?, search_key = ?, updated_at = ? where id = ?')
      .run(next, normKey(next + ' ' + (r.author || '')), NOW, r.id);
    audit(r.id, { field: 'title', from: t, to: next, why: 'رقم متسلسل مسرَّب في العنوان (مصدره فهرس رقمي)' });
    log('title  ' + r.id + ' :: "' + t + '" → "' + next + '"');
    n++;
  }
  log('titles fixed: ' + n);
}

// ---------- 2) authors from the source page ----------
const PLACEHOLDER = /^(مؤلف تراثي|مؤلف غير محدد|Unknown author|مجهول)$/;
function cleanField(v) {
  const t = String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (/^\|/.test(t) || /[{}]{2}/.test(t) || /^[^=]{0,24}=\s*$/.test(t)) return '';
  if (/^(مؤلف|باب|عنوان|محرر|ناشر|مترجم)\s*=/.test(t)) return '';
  return t.slice(0, 120);
}
async function fixAuthors() {
  const rows = db.prepare("select id, title, author, source_url, source_key from books where language = 'ar'").all()
    .filter((r) => PLACEHOLDER.test(String(r.author || '').trim()));
  log('placeholder authors to resolve: ' + rows.length);
  let n = 0, fails = 0;
  for (const r of rows) {
    try {
      if (!r.source_url || !/wikisource\.org/.test(r.source_url)) { fails++; continue; }
      const res = await fetchPolite(r.source_url, 1);
      const html = await res.text();
      // the infobox usually carries «| مؤلف = ...» / «|مؤلف= ...»
      let author = '';
      let m = html.match(/\|\s*مؤلف\s*=\s*([^|\n<}]{2,120})/);
      if (m) author = cleanField(m[1]);
      if (!author) {
        m = html.match(/<th[^>]*>\s*المؤلف\s*<\/th>\s*<td[^>]*>([\s\S]{0,200}?)<\/td>/);
        if (m) author = cleanField(m[1]);
      }
      if (!author) { fails++; await new Promise((x) => setTimeout(x, 250)); continue; }
      db.prepare('update books set author = ?, search_key = ?, updated_at = ? where id = ?')
        .run(author, normKey(String(r.title) + ' ' + author), NOW, r.id);
      audit(r.id, { field: 'author', from: r.author, to: author, why: 'استُخرج من حقل «مؤلف» في صفحة المصدر' });
      log('author ' + r.id + ' :: ' + r.author + ' → ' + author);
      n++;
      await new Promise((x) => setTimeout(x, 350));
    } catch (e) { fails++; }
  }
  log('authors filled: ' + n + ' | unresolved: ' + fails);
}

(async () => {
  const all = process.argv.includes('--all');
  if (all || process.argv.includes('--titles')) fixTitles();
  if (all || process.argv.includes('--authors')) await fixAuthors();
  const remaining = db.prepare("select count(*) c from books where language='ar' and (author='مؤلف تراثي' or author='مؤلف غير محدد' or author='مجهول')").get().c;
  log('remaining placeholder authors: ' + remaining);
})();
