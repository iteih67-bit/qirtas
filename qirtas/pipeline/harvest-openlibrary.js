// Harvest a large external catalogue (metadata + outbound reading links) from
// Open Library, which also exposes Internet Archive identifiers (the "ia" field).
// This makes Qirtas a searchable encyclopaedia of free-to-borrow/read books while
// hosting only public-domain full texts ourselves.
//
// Usage:
//   node pipeline/harvest-openlibrary.js --lang=ar --limit=5000
//   node pipeline/harvest-openlibrary.js --lang=en --limit=8000
//   node pipeline/harvest-openlibrary.js --lang=ar --limit=5000 --reset
'use strict';
const fs = require('fs');
const path = require('path');
const { readCatalog, fetchPolite, sleep, log, DATA, CACHE } = require('./lib/common');
const { normKey } = require('./lib/arabic');

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const has = (n) => process.argv.includes(`--${n}`);

const LANG = argOf('lang', 'ar');
const LIMIT = Number(argOf('limit', 5000));
const RESET = has('reset');
const OL_LANG = LANG === 'ar' ? 'ara' : LANG === 'en' ? 'eng' : LANG;

const OUT = path.join(DATA, 'external.json');
const SORT = argOf('sort', 'new');
const QOVER = argOf('q', '');

function short(row) {
  const title = (row.title || '').replace(/\s+/g, ' ').trim();
  if (!title) return null;
  const authors = (row.author_name || []).slice(0, 2).join(' · ');
  const ia = (row.ia || []).filter(Boolean)[0] || '';
  const key = row.key || '';
  const url = ia
    ? `https://archive.org/details/${encodeURIComponent(ia)}`
    : key ? `https://openlibrary.org${key}` : '';
  if (!url) return null;
  const year = row.first_publish_year || null;
  const subject = (row.subject || []).slice(0, 3).join(' · ');
  return {
    id: ia || key.replace('/works/', 'w-'),
    t: title.slice(0, 220),
    a: authors.slice(0, 120),
    lang: LANG,
    y: year,
    ia: ia || null,
    s: subject.slice(0, 120),
    u: url,
    src: ia ? 'archiveorg' : 'openlibrary',
    k: normKey(`${title} ${authors}`),
  };
}

(async () => {
  const hosted = new Set();
  try {
    for (const b of readCatalog()) {
      hosted.add(normKey(`${(b.title && (b.title.ar || b.title.en)) || ''} ${(b.author && (b.author.ar || b.author.en)) || ''}`));
    }
  } catch (e) { /* catalog optional */ }

  const raw = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  const existing = RESET ? raw.filter((x) => x.lang !== LANG) : raw;
  const seen = new Set(existing.map((x) => x.id));
  const seenKeys = new Set(existing.map((x) => x.k));
  const out = existing.slice();

  const PAGE = 100;
  const maxPages = Math.ceil(LIMIT / PAGE);
  let added = 0, dupLocal = 0, dupSeen = 0, failed = 0;

  for (let page = 1; page <= maxPages && added < LIMIT; page++) {
    const qs = new URLSearchParams({
      q: QOVER || `language:${OL_LANG}`,
      fields: 'key,title,author_name,first_publish_year,ia,subject',
      limit: String(PAGE),
      page: String(page),
      ...(SORT && SORT !== 'none' ? { sort: SORT } : {}),
    }).toString();
    let j = null;
    for (let attempt = 0; attempt < 3 && !j; attempt++) {
      try {
        const res = await fetchPolite(`https://openlibrary.org/search.json?${qs}`);
        j = await res.json();
      } catch (e) {
        failed++;
        await sleep(1500 * (attempt + 1));
      }
    }
    if (!j || !j.docs) { log(`  page ${page}: no data (skipped)`); await sleep(600); continue; }

    for (const row of j.docs) {
      const item = short(row);
      if (!item) continue;
      if (seen.has(item.id) || seenKeys.has(item.k)) { dupSeen++; continue; }
      if (hosted.has(item.k)) { dupLocal++; continue; }
      seen.add(item.id); seenKeys.add(item.k);
      out.push(item);
      added++;
    }
    if (page % 10 === 0) log(`  page ${page}: +${added} (total ${out.length})`);
    await sleep(260);

    if (!j.docs.length) break;
  }

  fs.writeFileSync(OUT, JSON.stringify(out));
  fs.writeFileSync(path.join(CACHE, `openlibrary-${LANG}.json`), JSON.stringify({
    lang: LANG, added, total: out.length, dupSeen, dupLocal, failed, at: new Date().toISOString(),
  }, null, 2));
  log(`openlibrary[${LANG}]: added ${added}, total ${out.length} (dupes: seen ${dupSeen}, hosted ${dupLocal}), request failures ${failed}`);
  log(`size: ${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB → ${OUT}`);
})();
