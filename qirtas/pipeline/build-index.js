// Build a compact client-side search index from the catalog.
// Usage: node pipeline/build-index.js   →  books-data/index.json
'use strict';
const fs = require('fs');
const path = require('path');
const { readCatalog, DATA, log } = require('./lib/common');
const { normKey } = require('./lib/arabic');

function main() {
  const catalog = readCatalog();
  const rows = catalog.map((b) => {
    const titleAr = (b.title && (b.title.ar || b.title.en)) || b.id;
    const titleEn = (b.title && (b.title.en || b.title.ar)) || b.id;
    const authorAr = (b.author && (b.author.ar || b.author.en)) || '';
    const authorEn = (b.author && (b.author.en || b.author.ar)) || '';
    return {
      id: b.id,
      t: titleAr,
      te: titleEn,
      a: authorAr,
      ae: authorEn,
      lang: b.lang || 'en',
      cat: b.cat || 'english',
      src: b.sourceKey || b.source || 'other',
      w: b.words || 0,
      ch: b.chapters || 0,
      y: b.year || null,
      e: b.emoji || '📚',
      g: b.grad || 'cover-g3',
      ad: b.addedAt || '',
      k: normKey(`${titleAr} ${titleEn} ${authorAr} ${authorEn}`),
    };
  });

  const out = {
    generatedAt: new Date().toISOString(),
    count: rows.length,
    bySource: rows.reduce((m, r) => ((m[r.src] = (m[r.src] || 0) + 1), m), {}),
    byLang: rows.reduce((m, r) => ((m[r.lang] = (m[r.lang] || 0) + 1), m), {}),
    totalWords: rows.reduce((n, r) => n + r.w, 0),
    books: rows,
  };

  const file = path.join(DATA, 'index.json');
  fs.writeFileSync(file, JSON.stringify(out));
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  log(`index: ${rows.length} books, ${kb} KB (${(out.totalWords / 1e6).toFixed(2)}M words)`);
  log('by lang: ' + JSON.stringify(out.byLang) + '  by source: ' + JSON.stringify(out.bySource));
}

main();
