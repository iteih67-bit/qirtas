// Pre-generate one EPUB 3 file per visible book into dist/download/<id>.epub
// so that downloads work on purely static hosting (GitHub Pages) and on the Node server alike.
'use strict';
const fs = require('fs');
const path = require('path');
const { buildEpub } = require('../../server.js');

const DIST = path.join(__dirname, '..', 'dist');
const BOOKS = path.join(DIST, 'books');
const OUT = path.join(DIST, 'download');
const catalog = JSON.parse(fs.readFileSync(path.join(DIST, 'catalog.json'), 'utf8'));

fs.mkdirSync(OUT, { recursive: true });
let ok = 0, skipped = 0, bytes = 0;
const failed = [];
for (const b of catalog) {
  const textFile = path.join(BOOKS, b.id + '.json');
  if (!fs.existsSync(textFile)) { skipped++; continue; }
  try {
    const text = JSON.parse(fs.readFileSync(textFile, 'utf8'));
    const book = {
      id: b.id,
      title: b.title && (b.title.ar || b.title.en) || '',
      author: b.author && (b.author.ar || b.author.en) || '',
      language: b.lang || 'ar',
      source_url: (b.sourceUrl && (b.sourceUrl.ar || b.sourceUrl)) || '',
      license_label: (b.licenseLabel && (b.licenseLabel.ar || b.licenseLabel)) || 'ملكية عامة',
    };
    const buf = buildEpub(book, text);
    fs.writeFileSync(path.join(OUT, b.id + '.epub'), buf);
    ok++; bytes += buf.length;
  } catch (e) {
    failed.push({ id: b.id, err: String(e.message).slice(0, 90) });
  }
}
console.log(`epub: ${ok} written, ${skipped} skipped, ${failed.length} failed — ${(bytes / 1048576).toFixed(1)} MB → site/dist/download/`);
if (failed.length) console.log('failures: ' + JSON.stringify(failed.slice(0, 8)));
if (failed.length) process.exitCode = 1;
