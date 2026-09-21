// One-time seed: convert the 4 MVP books (reading-app-mvp/js/books.js) into the
// unified catalog + text JSON format.
'use strict';
const fs = require('fs');
const path = require('path');
const { readCatalog, writeCatalog, saveText, countWords, log } = require('./lib/common');

const MVP_BOOKS_SRC = path.join(__dirname, '..', '..', 'reading-app-mvp', 'js', 'books.js');
const src = fs.readFileSync(MVP_BOOKS_SRC, 'utf8');

// evaluate the MVP data file in isolation
const sandbox = new Function(src + '\nreturn { BOOKS, CATEGORIES };');
const { BOOKS } = sandbox();

const catalog = readCatalog();
const existing = new Set(catalog.map((b) => b.id));

for (const b of BOOKS) {
  if (existing.has(b.id)) { log('skip (exists): ' + b.id); continue; }
  saveText({
    id: b.id,
    chapters: b.chapters.map((ch) => ({
      title: { ar: ch.title.ar, en: ch.title.en },
      paragraphs: ch.paragraphs,
    })),
  });
  catalog.push({
    id: b.id,
    source: 'mvp',
    title: b.title,
    author: b.author,
    year: b.year,
    lang: b.cat === 'arabic' ? 'ar' : 'en',
    cat: b.cat,
    description: b.description,
    grad: b.grad,
    emoji: b.emoji,
    chapters: b.chapters.length,
    words: b.chapters.reduce((n, ch) => n + countWords(ch.paragraphs), 0),
    addedAt: new Date().toISOString().slice(0, 10),
  });
  log('seeded: ' + b.title.ar);
}
writeCatalog(catalog);
log('catalog size: ' + catalog.length);
