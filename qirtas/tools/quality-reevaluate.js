// Re-evaluate hidden books: the OCR-quality gate was too strict and hid healthy
// Arabic texts. Recompute the metric and unhide anything above a safe threshold.
//   node tools/quality-reevaluate.js --threshold=0.35 [--fix]
'use strict';
const fs = require('fs');
const path = require('path');
const Q = path.resolve(__dirname, '..');
const metadata = require(path.join(Q, 'pipeline', 'lib', 'metadata.js'));
const ratio = metadata.arabicWordRatio;
const DIST = path.join(Q, 'site', 'dist');
const { DatabaseSync } = require('node:sqlite');
const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const THRESHOLD = Number(argOf('threshold', 0.35));
const FIX = process.argv.includes('--fix');
const db = new DatabaseSync(path.join(Q, 'data', 'qirtas.db'));


const hidden = db.prepare('select id, title, words, language, removed_reason from books where hidden = 1').all();
const now = new Date().toISOString();
let unhide = 0, keep = 0;
const report = [];
for (const b of hidden) {
  let p = path.join(DIST, 'books', b.id + '.json');
  if (!fs.existsSync(p)) p = path.join(Q, 'books-data', 'texts', b.id + '.json');
  let text = '';
  try { const j = JSON.parse(fs.readFileSync(p, 'utf8')); text = (j.chapters || []).map((c) => (c.paragraphs || []).join(' ')).join(' '); } catch (e) {}
  const r = text ? ratio(text) : 0;
  report.push({ id: b.id, title: String(b.title).slice(0, 50), words: b.words, ratio: +r.toFixed(3), reason: b.removed_reason });
  // anything that is not unusable is shown again; 'review' stays visible but flagged
  if (metadata.qualityVerdict(r) !== 'unusable') {
    if (FIX) {
      db.prepare('update books set hidden = 0, removed_reason = null, updated_at = ? where id = ?').run(now, b.id);
      db.prepare('insert into audit_log (actor, action, target_type, target_id, details, created_at) values (?,?,?,?,?,?)')
        .run('maintenance', 'book.restored', 'book', b.id, JSON.stringify({ why: 'معيار الجودة كان متشددًا؛ النص سليم بنسبة ' + r.toFixed(3), previousReason: b.removed_reason }), now);
    }
    unhide++;
  } else keep++;
}
report.sort((a, b) => b.ratio - a.ratio);
console.log('hidden books scanned: ' + hidden.length + ' | to restore (>= ' + THRESHOLD + '): ' + unhide + ' | keep hidden: ' + keep);
console.log('highest restored ratios : ' + report.slice(0, 5).map((x) => x.ratio).join(', '));
console.log('kept hidden (worst 8)   :');
report.slice(-8).forEach((x) => console.log('   - ' + x.ratio + '  ' + x.id + ' :: ' + x.title));
fs.writeFileSync(path.join(Q, 'cache', 'quality-reevaluation.json'), JSON.stringify(report, null, 2));
if (!FIX) console.log('\n(run with --fix to restore)');
