// Clean already-harvested book texts: drop navigation stubs, redirect markers and
// near-empty chapters, then refresh chapter/word counts in the catalog.
// Usage: node pipeline/clean-texts.js [--dry]
'use strict';
const fs = require('fs');
const path = require('path');
const { readCatalog, writeCatalog, readText, saveText, countWords, log } = require('./lib/common');
const { cleanChapters } = require('./lib/clean');

const DRY = process.argv.includes('--dry');

const catalog = readCatalog();
let touched = 0, chaptersDropped = 0, booksEmptied = [], wordsBefore = 0, wordsAfter = 0;

for (const b of catalog) {
  let text;
  try { text = readText(b.id); } catch (e) { continue; }
  const before = (text.chapters || []).length;
  wordsBefore += (text.chapters || []).reduce((n, c) => n + countWords(c.paragraphs || []), 0);

  const { chapters, dropped } = cleanChapters(text.chapters || []);
  const words = chapters.reduce((n, c) => n + countWords(c.paragraphs), 0);
  wordsAfter += words;

  if (dropped === 0 && words === (b.words || 0)) continue;
  if (chapters.length === 0 || words < 500) {
    booksEmptied.push({ id: b.id, before, after: chapters.length, words });
    chaptersDropped += before;
    continue;
  }
  chaptersDropped += dropped;
  touched++;
  b.chapters = chapters.length;
  b.words = words;
  if (!DRY) saveText({ id: b.id, chapters });
}

if (!DRY && booksEmptied.length) {
  const drop = new Set(booksEmptied.map((x) => x.id));
  for (let i = catalog.length - 1; i >= 0; i--) if (drop.has(catalog[i].id)) catalog.splice(i, 1);
}

if (!DRY) writeCatalog(catalog);

log(`clean-texts${DRY ? ' (dry)' : ''}: books updated ${touched}, chapters dropped ${chaptersDropped}, books removed ${booksEmptied.length}`);
log(`words: ${wordsBefore.toLocaleString('en-US')} → ${wordsAfter.toLocaleString('en-US')}`);
if (booksEmptied.length) log('removed: ' + booksEmptied.map((x) => `${x.id}(${x.words}w)`).join(', '));
log('catalog total: ' + catalog.length);
