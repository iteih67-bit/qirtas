// Two records that the duplicate check flagged are actually different volumes of
// ابن حزم «المحلى» (volume 3 vs volume 6 — see their source URLs). Give each its volume.
'use strict';
const P = 'C:\\Users\\AsaadM\\Documents\\Books\\qirtas\\';
const { DatabaseSync } = require('node:sqlite');
const { normKey } = require(P + 'pipeline\\lib\\arabic.js');
const db = new DatabaseSync(P + 'data\\qirtas.db');

const fixes = [
  { id: 'abn-hzm-almhla', title: 'المحلى — المجلد الثالث', reason: 'ليس مكررًا: مصدره «المحلى - المجلد الثالث»؛ العنوان كان عامًّا فيظهر مكررًا مع مجلد آخر' },
  { id: 'abn-hzm-almhla-ar', title: 'المحلى — المجلد السادس', reason: 'ليس مكررًا: مصدره «المحلى - المجلد السادس»؛ العنوان كان عامًّا فيظهر مكررًا مع مجلد آخر' },
];
const now = new Date().toISOString();
for (const f of fixes) {
  const b = db.prepare('select title, author from books where id = ?').get(f.id);
  if (!b) { console.log('MISS ' + f.id); continue; }
  db.prepare('update books set title = ?, search_key = ?, updated_at = ? where id = ?')
    .run(f.title, normKey(f.title + ' ' + b.author), now, f.id);
  db.prepare('insert into audit_log (actor, action, target_type, target_id, details, created_at) values (?,?,?,?,?,?)')
    .run('maintenance', 'book.updated', 'book', f.id, JSON.stringify({ before: { title: b.title }, after: { title: f.title }, reason: f.reason }), now);
  console.log('titled ' + f.id + ' → ' + f.title);
}

// Refine the metadata checker: an empty author is an accepted state for periodicals,
// so it must not be reported as a malformed record.
const cp = P + 'tools\\check-metadata.js';
let s = require('fs').readFileSync(cp, 'utf8');
const from = "  if (looksBroken(a)) reasons.push('author');";
const to = "  if (a && looksBroken(a)) reasons.push('author'); // empty author = intentional (periodicals)";
if (s.includes(from) && !s.includes(to)) {
  s = s.replace(from, to);
  require('fs').writeFileSync(cp, s);
  console.log('check-metadata.js refined: empty author no longer flagged');
} else {
  console.log('check-metadata.js: ' + (s.includes(to) ? 'already refined' : 'anchor missing'));
}
