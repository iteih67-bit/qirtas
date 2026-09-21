// sanitize-metadata.js — keep template-fragment junk out of the catalog.
// Idempotent: safe to run after every import. Records any change in audit_log.
'use strict';
const P = 'C:\\Users\\AsaadM\\Documents\\Books\\qirtas\\';
const { DatabaseSync } = require('node:sqlite');
const { normKey } = require(P + 'pipeline\\lib\\arabic.js');
const db = new DatabaseSync(P + 'data\\qirtas.db');

// A value that looks like a leaked template parameter rather than real metadata.
function cleanValue(s) {
  const v = String(s == null ? '' : s).trim();
  if (!v) return '';
  if (/^\|/.test(v)) return '';                                    // "|مؤلف ="
  if (/[{}]{2}/.test(v)) return '';                                // "{{...}}"
  if (/^[^=]{0,24}=\s*$/.test(v)) return '';                       // "المؤلف ="
  if (/^(مؤلف|باب|عنوان|محرر|ناشر|مترجم|سنة|وصف)\s*=/.test(v)) return ''; // "مؤلف = س"
  if (v === '-' || v === '—') return '';
  return v;
}

// Recover a usable title from the source URL when the parsed title is unusable.
function titleFromUrl(url) {
  try {
    const seg = decodeURIComponent(String(url).split('/wiki/')[1] || '').replace(/_/g, ' ').trim();
    return cleanValue(seg);
  } catch (e) { return ''; }
}

const VOL = /المجلد\s+(الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)/;
const rows = db.prepare('select id, title, author, source_url from books').all();
const now = new Date().toISOString();
let changed = 0;
const log = [];

for (const r of rows) {
  let title = cleanValue(r.title);
  let author = cleanValue(r.author);

  if (!title) {
    title = titleFromUrl(r.source_url);
    if (title) log.push({ id: r.id, field: 'title', from: r.title, to: title, why: 'عنوان غير صالح — استُعيد من اسم صفحة المصدر' });
  }

  // volumes of the same work must be distinguishable
  const v = String(r.source_url || '').match(VOL);
  if (v && title && !title.includes(v[0])) {
    const nt = `${title} — ${v[0]}`;
    log.push({ id: r.id, field: 'title', from: title, to: nt, why: 'تمييز المجلد من رابط المصدر' });
    title = nt;
  }

  if (title === r.title && author === (r.author || '')) continue;
  db.prepare('update books set title = ?, author = ?, search_key = ?, updated_at = ? where id = ?')
    .run(title, author, normKey(title + ' ' + author), now, r.id);
  changed++;
}

for (const e of log) {
  db.prepare('insert into audit_log (actor, action, target_type, target_id, details, created_at) values (?,?,?,?,?,?)')
    .run('maintenance', 'book.updated', 'book', e.id, JSON.stringify(e), now);
}

console.log('sanitize: ' + rows.length + ' records scanned, ' + changed + ' updated, ' + log.length + ' title repairs');
for (const e of log.slice(0, 20)) console.log('  ' + e.id + ': "' + e.from + '" → "' + e.to + '"  (' + e.why + ')');
console.log('audit rows now: ' + db.prepare('select count(*) c from audit_log').get().c);
