// Qirtas DB CLI — import the JSON catalogue into SQLite, export it back, query it.
// Usage: node pipeline/db-cli.js <import|export|stats|search|dupcheck|request:create|request:list|run:start|run:finish|verify> [args]
'use strict';
const fs = require('fs');
const path = require('path');
const db = require('./lib/db');
const { readCatalog, DATA, TEXTS, log } = require('./lib/common');

const cmd = process.argv[2] || 'stats';

function importCatalog() {
  const catalog = readCatalog();
  const runId = db.startRun('catalog-json', 'استيراد الكتالوج المحلي إلى قاعدة البيانات');
  let added = 0;
  for (const b of catalog) {
    const textPath = path.join(TEXTS, b.id + '.json');
    const exists = fs.existsSync(textPath);
    db.upsertBook({
      ...b,
      filePath: exists ? `books/${b.id}.json` : null,
      fileFormat: exists ? 'json' : null,
      fileBytes: exists ? fs.statSync(textPath).size : null,
    });
    added++;
  }
  db.finishRun(runId, { added, notes: `catalog=${catalog.length}` });
  log(`import: ${added} كتابًا إلى ${db.DB_FILE}`);
}

function exportCatalog() {
  const rows = db.listBooks({ includeHidden: false });
  const out = rows.map((r) => ({
    id: r.id,
    ...(r.gutenberg_id ? { gutenbergId: r.gutenberg_id } : {}),
    source: r.source_key,
    sourceKey: r.source_key,
    sourceLabel: { ar: r.source_label || r.source_key, en: r.source_label || r.source_key },
    sourceUrl: r.source_url || '',
    license: r.license_type || 'public-domain',
    licenseLabel: { ar: r.license_label || 'ملكية عامة', en: r.license_label || 'Public domain' },
    licenseUrl: r.license_url || '',
    licenseAudit: r.license_audit || '',
    title: { ar: r.title, en: r.title_en || r.title },
    author: { ar: r.author || '', en: r.author_en || r.author || '' },
    translator: r.translator || null,
    publisher: r.publisher || null,
    deathYear: r.death_year || null,
    year: r.year || null,
    era: r.era,
    lang: r.language,
    langLabel: { ar: r.language === 'ar' ? 'العربية' : 'الإنجليزية', en: r.language === 'ar' ? 'Arabic' : 'English' },
    cat: r.category || (r.language === 'ar' ? 'arabic' : 'english'),
    description: { ar: r.description || '', en: r.description_en || r.description || '' },
    grad: r.cover || 'cover-g3',
    emoji: r.emoji || '📚',
    chapters: r.chapters || 0,
    words: r.words || 0,
    addedAt: r.created_at || '',
    updatedAt: r.updated_at || '',
  }));
  fs.writeFileSync(path.join(DATA, 'catalog.json'), JSON.stringify(out, null, 2));
  log(`export: ${out.length} كتابًا → books-data/catalog.json`);
}

const handlers = {
  import: importCatalog,
  export: exportCatalog,
  stats() {
    const s = db.stats();
    console.log(JSON.stringify(s, null, 2));
  },
  search() {
    const q = process.argv[3] || '';
    const opts = {};
    for (const a of process.argv.slice(4)) {
      const [k, v] = a.replace(/^--/, '').split('=');
      if (k) opts[k] = v;
    }
    const rows = db.searchBooks(q, { lang: opts.lang, cat: opts.cat, era: opts.era, limit: Number(opts.limit || 20) });
    console.log(JSON.stringify({ query: q, normalized: db.normKey(q), count: rows.length, rows }, null, 2));
  },
  dupcheck() {
    const rows = db.open().prepare('SELECT search_key k, COUNT(*) c, GROUP_CONCAT(id) ids FROM books GROUP BY search_key HAVING c > 1 ORDER BY c DESC LIMIT 25').all();
    console.log(JSON.stringify({ duplicateGroups: rows.length, rows }, null, 2));
  },
  'request:create'() {
    const [, , , requester, bookTitle] = process.argv;
    const id = db.createRequest({
      requester: requester || 'اختبار آلي',
      book_title: bookTitle || 'كتاب اختباري',
      role: 'الناشر',
      email: 'test@example.org',
      claim_type: 'تحويل الرابط إلى الموقع الرسمي',
      official_url: 'https://example.org/official',
      message: 'طلب اختباري للتحقق من دورة المراجعة',
      ip: '127.0.0.1',
    });
    console.log(JSON.stringify({ createdRequestId: id }));
  },
  'request:list'() {
    console.log(JSON.stringify(db.listRequests(process.argv[3]), null, 2));
  },
  'run:start'() {
    console.log(JSON.stringify({ runId: db.startRun(process.argv[3] || 'manual', process.argv[4] || '', process.argv[5] || '') }));
  },
  'run:finish'() {
    db.finishRun(Number(process.argv[3]), {
      added: Number(process.argv[4] || 0), skipped: Number(process.argv[5] || 0), failed: Number(process.argv[6] || 0),
    });
    console.log(JSON.stringify({ finished: Number(process.argv[3]) }));
  },
  runs() { console.log(JSON.stringify(db.listRuns(20), null, 2)); },
  audit() { console.log(JSON.stringify(db.listAudit(Number(process.argv[3] || 30)), null, 2)); },
  verify() {
    const s = db.stats();
    const q1 = db.open().prepare(`SELECT COUNT(*) c FROM books WHERE source_url IS NOT NULL AND source_url <> ''`).get().c;
    const q2 = db.open().prepare(`SELECT COUNT(*) c FROM books WHERE license_label IS NOT NULL AND license_label <> ''`).get().c;
    const q3 = db.open().prepare(`SELECT COUNT(*) c FROM books WHERE search_key IS NOT NULL AND search_key <> ''`).get().c;
    const q4 = db.open().prepare(`SELECT COUNT(*) c FROM books WHERE language='ar' AND search_key LIKE '%ا%'`).get().c;
    const q5 = db.open().prepare(`SELECT COUNT(*) c FROM books WHERE language='ar' AND (translator IS NULL)`).get().c;
    console.log(JSON.stringify({
      dbFile: db.DB_FILE,
      total: s.total, visible: s.visible, arabic: s.arabic, english: s.english,
      hidden: s.hidden, removed: s.removed, totalWords: s.words,
      withSourceUrl: q1, withLicenseLabel: q2, withSearchKey: q3,
      arabicSearchable: q4, arabicWithoutTranslator: q5,
      pendingTakedowns: s.pendingRequests,
      bySource: s.bySource, byEra: s.byEra, byCategory: s.byCategory,
    }, null, 2));
  },};

const fn = handlers[cmd];
if (!fn) {
  console.error('unknown command: ' + cmd + '\n' + Object.keys(handlers).join(' | '));
  process.exit(2);
}
fn();
