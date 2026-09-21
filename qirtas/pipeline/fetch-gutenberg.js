// Fetch + clean Gutenberg texts for the fresh candidate list, add to catalog.
// Usage: node pipeline/fetch-gutenberg.js [--limit=45]
'use strict';
const fs = require('fs');
const path = require('path');
const {
  readCatalog, writeCatalog, saveText, hasText, asciiSlug, countWords,
  rawToParagraphs, stripGutenbergBoilerplate, isChapterHeading, fetchPolite, sleep, log,
  COVERS, EMOJIS, CACHE,
} = require('./lib/common');

const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 45);
const MAX_BYTES = 4_000_000; // skip encyclopedic monsters

const fresh = JSON.parse(fs.readFileSync(path.join(CACHE, 'gutenberg-fresh.json'), 'utf8'));
const catalog = readCatalog();
const knownGids = new Set(catalog.filter((b) => b.gutenbergId).map((b) => String(b.gutenbergId)));
const usedSlugs = new Set(catalog.map((b) => b.id));

function prettyAuthor(raw) {
  if (!raw) return { ar: 'مجهول', en: 'Anonymous' };
  const name = raw.split(';')[0].trim().replace(/\s*,\s*(\d|b\.|ca\.|circa|active|-\s*$)/g, ', $1');
  // "Austen, Jane, 1775-1817" → "Jane Austen"
  const parts = name.split(',').map((p) => p.trim()).filter(Boolean);
  const years = parts.filter((p) => /^\d{1,4}(-\d{0,4})?$/.test(p) || /^(b\.|ca\.)/.test(p));
  const nameParts = parts.filter((p) => !years.includes(p));
  const display = nameParts.length > 1 ? nameParts.slice(0, 2).reverse().join(' ') : nameParts[0] || raw;
  const deathM = raw.match(/(\d{3,4})\s*\)?\s*$/);
  return { display, deathYear: deathM ? Number(deathM[1]) : null };
}

function autoDescription(title, author, subjects) {
  const subj = (subjects || '').split('--')[0].trim();
  return {
    en: `${title} by ${author}. ${subj ? subj + '.' : ''} A public-domain classic, free to read on Qirtas.`.replace(/\s+/g, ' '),
    ar: `${title} — رواية كلاسيكية من الملكية العامة بقلم ${author}. اقرأها مجاناً بترجمة أصلية على منصة قِرطاس، بترقيم صفحات مريح ووضع ليلي.`,
  };
}

(async () => {
let ok = 0, failed = [];
for (const cand of fresh) {
  if (ok >= LIMIT) break;
  if (knownGids.has(cand.gid)) continue;
  const author = prettyAuthor(cand.authors);
  const slug = asciiSlug(cand.title, 'gutenberg-' + cand.gid);
  const id = usedSlugs.has(slug) ? `${slug}-g${cand.gid}` : slug;
  log(`fetching [${cand.gid}] ${cand.title.slice(0, 50)}…`);
  try {
    // preferred UTF-8 location, then legacy path
    let raw = null, lastSkip = '';
    for (const url of [
      `https://www.gutenberg.org/cache/epub/${cand.gid}/pg${cand.gid}.txt`,
      `https://www.gutenberg.org/files/${cand.gid}/${cand.gid}-0.txt`,
    ]) {
      try {
        const res = await fetchPolite(url);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_BYTES) { lastSkip = 'too big (' + (buf.length / 1e6).toFixed(1) + 'MB)'; continue; }
        raw = buf.toString('utf8');
        break;
      } catch (e) {
        if (/404/.test(e.message)) { lastSkip = lastSkip || 'not found at gutenberg (404)'; continue; }
        throw e;
      }
    }
    if (!raw) throw new Error(lastSkip || 'no text found');

    const body = stripGutenbergBoilerplate(raw);
    const paragraphs = rawToParagraphs(body);
    if (paragraphs.length < 30) throw new Error(`too short (${paragraphs.length} paragraphs)`);

    // split into chapters
    const chapters = [];
    let current = { title: { ar: 'البداية', en: 'Beginning' }, paragraphs: [] };
    for (const p of paragraphs) {
      const firstLine = p.split('. ')[0];
      if (isChapterHeading(p) || (p.length < 80 && isChapterHeading(p + '.'))) {
        if (current.paragraphs.length) chapters.push(current);
        current = { title: { ar: p, en: p }, paragraphs: [] };
      } else current.paragraphs.push(p);
    }
    if (current.paragraphs.length) chapters.push(current);
    if (chapters.length === 1 && chapters[0].paragraphs.length > 400) {
      // no headings found — chunk into ~100-paragraph parts for readable pagination
      const parts = [];
      const flat = chapters[0].paragraphs;
      for (let i = 0; i < flat.length; i += 100) {
        parts.push({ title: { ar: `الجزء ${parts.length + 1}`, en: `Part ${parts.length + 1}` }, paragraphs: flat.slice(i, i + 100) });
      }
      chapters.length = 0;
      chapters.push(...parts);
    }

    saveText({ id, chapters });
    usedSlugs.add(id);

    catalog.push({
      id,
      gutenbergId: cand.gid,
      source: 'gutenberg',
      title: { ar: cand.title, en: cand.title },
      author: { ar: author.display, en: author.display },
      deathYear: author.deathYear,
      year: null,
      lang: 'en',
      cat: 'english',
      description: autoDescription(cand.title, author.display, cand.subjects),
      grad: COVERS[catalog.length % COVERS.length],
      emoji: EMOJIS[catalog.length % EMOJIS.length],
      chapters: chapters.length,
      words: chapters.reduce((n, ch) => n + countWords(ch.paragraphs), 0),
      addedAt: new Date().toISOString().slice(0, 10),
    });
    knownGids.add(cand.gid);
    ok++;
    log(`  ✓ ${id} — ${chapters.length} chapters, ${catalog.at(-1).words} words`);
    await sleep(1100); // politeness: ~1 req/sec
  } catch (e) {
    failed.push({ gid: cand.gid, title: cand.title.slice(0, 50), reason: e.message.slice(0, 80) });
    log(`  ✗ failed: ${e.message.slice(0, 70)}`);
    await sleep(600);
  }
}
writeCatalog(catalog);
fs.writeFileSync(path.join(CACHE, 'gutenberg-failures.json'), JSON.stringify(failed, null, 2));
log(`DONE — added ${ok}, failed ${failed.length}. Catalog total: ${catalog.length}`);
})();
