// Harvest: combine Gutenberg's real "most downloaded" list (top 1000 over the
// last 30 days) with catalog metadata to pick popular English classics.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { readCatalog, fetchPolite, CACHE, log } = require('./lib/common');

const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 60);
const MIN_DOWNLOADS = Number(process.argv.find((a) => a.startsWith('--min='))?.split('=')[1] || 1200);

// --- minimal RFC4180 CSV parser (quoted fields + escaped quotes) ---
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const gz = fs.readFileSync(path.join(CACHE, 'pg_catalog.csv.gz'));
const rows = parseCSV(zlib.gunzipSync(gz).toString('utf8'));
const header = rows[0];
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
log('catalog rows: ' + (rows.length - 1));

const meta = new Map();
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (r.length < header.length) continue;
  meta.set(r[col['Text#']], {
    type: (r[col['Type']] || '').trim(),
    lang: (r[col['Language']] || '').trim(),
    title: (r[col['Title']] || '').trim(),
    authors: (r[col['Authors']] || '').trim(),
    subjects: (r[col['Subjects']] || '').trim(),
  });
}

(async () => {
// real popularity: top-1000 most downloaded over the last 30 days
const topHtml = await (await fetchPolite('https://www.gutenberg.org/browse/scores/top1000.php')).text();
const topIds = [...topHtml.matchAll(/\/ebooks\/(\d+)/g)].map((m) => m[1]);
const uniqTop = [...new Set(topIds)];
log('top1000 ids parsed: ' + uniqTop.length);

const BLOCKLIST = /world factbook|copyright|gutenberg newsletter/i;
const candidates = [];
for (const gid of uniqTop) {
  const m = meta.get(gid);
  if (!m) continue;
  if (m.type !== 'Text') continue;
  if (!/^en/.test(m.lang)) continue;
  if (!m.title || BLOCKLIST.test(m.title)) continue;
  candidates.push({ gid, title: m.title, authors: m.authors, subjects: m.subjects, downloads: MIN_DOWNLOADS });
}

const catalog = readCatalog();
const knownGids = new Set(catalog.filter((b) => b.gutenbergId).map((b) => String(b.gutenbergId)));
const fresh = candidates.filter((c) => !knownGids.has(c.gid)).slice(0, LIMIT);

fs.writeFileSync(path.join(CACHE, 'gutenberg-candidates.json'), JSON.stringify(candidates, null, 2));
fs.writeFileSync(path.join(CACHE, 'gutenberg-fresh.json'), JSON.stringify(fresh, null, 2));
log(`popular English candidates: ${candidates.length} — fresh picked: ${fresh.length}`);
for (const c of fresh.slice(0, 10)) log(`  • [${c.gid}] ${c.title.slice(0, 60)}`);
})();
