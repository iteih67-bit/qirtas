// Repair the three malformed metadata records, with audit entries.
'use strict';
const path = require('path');
const Q = path.resolve(__dirname, '..');
const P = Q + path.sep;
const { DatabaseSync } = require('node:sqlite');
const { normKey } = require(path.join(Q, 'pipeline', 'lib', 'arabic.js'));
const db = new DatabaseSync(path.join(Q, 'data', 'qirtas.db'));

const fixes = [
  { id: 'mwlf', title: 'الروح', author: 'ابن قيم الجوزية', reason: 'العنوان والمؤلف كانا بقايا قالب ويكي («|مؤلف =»)؛ صُحّحا من رأس صفحة المصدر: الروح — ابن قيم الجوزية' },
  { id: 'mjla-albyan-llbrqwqy', author: '', reason: 'حقل المؤلف كان بقايا قالب («| مترجم =»)؛ حُذف ليظهر «مؤلف غير محدد» بدل قيمة خاطئة' },
  { id: 'mjla-alrsala', author: '', reason: 'حقل المؤلف كان بقايا قالب («| مترجم =»)؛ حُذف ليظهر «مؤلف غير محدد» بدل قيمة خاطئة' },
];
const now = new Date().toISOString();
let n = 0;
for (const f of fixes) {
  const b = db.prepare('select title, author from books where id = ?').get(f.id);
  if (!b) { console.log('MISS ' + f.id); continue; }
  const title = f.title != null ? f.title : b.title;
  const author = f.author != null ? f.author : b.author;
  db.prepare('update books set title = ?, author = ?, search_key = ?, updated_at = ? where id = ?')
    .run(title, author, normKey(title + ' ' + author), now, f.id);
  db.prepare('insert into audit_log (actor, action, target_type, target_id, details, created_at) values (?,?,?,?,?,?)')
    .run('maintenance', 'book.updated', 'book', f.id,
      JSON.stringify({ before: { title: b.title, author: b.author }, after: { title, author }, reason: f.reason }), now);
  n++;
  console.log('fixed ' + f.id + ' → title="' + title + '" author="' + author + '"');
}
console.log('repaired: ' + n + ' | audit rows now: ' + db.prepare('select count(*) c from audit_log').get().c);
