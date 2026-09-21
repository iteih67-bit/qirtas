// Cleanup pass: prefer complete editions, drop duplicate gutenberg editions,
// tidy titles, remove superseded MVP partials.
'use strict';
const fs = require('fs');
const path = require('path');
const { readCatalog, writeCatalog, TEXTS, log } = require('./lib/common');

let catalog = readCatalog();
const removed = [];

// 1) drop superseded partial MVP versions when a complete Gutenberg edition exists
const has = (id) => catalog.some((b) => b.id === id);
for (const partial of ['alice', 'austen']) {
  if (has(partial) && (has('alices-adventures-in-wonderland') || has('pride-and-prejudice'))) {
    catalog = catalog.filter((b) => b.id !== partial);
    removed.push(partial + ' (superseded by complete edition)');
  }
}

// 2) drop "-gNNN" duplicate editions whose base slug exists
for (const b of [...catalog]) {
  const m = b.id.match(/^(.+)-g(\d+)$/);
  if (m && has(m[1])) {
    catalog = catalog.filter((x) => x.id !== b.id);
    removed.push(b.id + ' (duplicate edition)');
  }
}

// 3) tidy titles (collapse newlines/spaces from catalog metadata)
for (const b of catalog) {
  for (const l of ['ar', 'en']) {
    if (typeof b.title?.[l] === 'string') b.title[l] = b.title[l].replace(/\s+/g, ' ').trim();
  }
  if (typeof b.description?.en === 'string') b.description.en = b.description.en.replace(/\s+/g, ' ').trim();
  if (typeof b.description?.ar === 'string') b.description.ar = b.description.ar.replace(/\s+/g, ' ').trim();
}

writeCatalog(catalog);

// 4) delete orphaned text files
for (const f of fs.readdirSync(TEXTS)) {
  const id = f.replace(/\.json$/, '');
  if (!catalog.some((b) => b.id === id)) {
    fs.unlinkSync(path.join(TEXTS, f));
    removed.push('text: ' + f);
  }
}

log('cleanup done — catalog: ' + catalog.length);
for (const r of removed) log('  − ' + r);
