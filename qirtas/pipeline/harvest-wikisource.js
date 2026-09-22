// Generic Wikisource harvester (Arabic + English) — zero external deps.
// Discovers real books by finding main-namespace "root" pages that have >=3
// subpages (e.g. "كتاب الأم/كتاب الصلاة"), reads their header template for
// author/year, renders each chapter to clean paragraphs and writes book JSON.
//
// Usage:
//   node pipeline/harvest-wikisource.js --lang=ar --limit=120
//   node pipeline/harvest-wikisource.js --lang=en --limit=60 --scan=200
//   node pipeline/harvest-wikisource.js --lang=ar --limit=5 --dry   (no writes)
'use strict';
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const {
  readCatalog, writeCatalog, saveText, countWords, fetchPolite, sleep, log, COVERS, EMOJIS, CACHE,
} = require('./lib/common');
const { arSlug } = require('./lib/arabic');
const { isJunkChapter } = require('./lib/clean');

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
// --- metadata guard -------------------------------------------------------
// A wiki infobox can leak a template parameter (e.g. "|مؤلف =", "Title|مؤلف=X",
// "…|ملاحظات = }}"). Such a value is never valid metadata, so it is dropped.
function cleanField(v) {
  const t = String(v == null ? '' : v).trim();
  if (!t) return '';
  if (/^\|/.test(t)) return '';
  if (/[{}]{2}/.test(t)) return '';
  if (/\|/.test(t) && /(=|\{\})/.test(t)) return '';
  if (/^[^=]{0,24}=\s*$/.test(t)) return '';
  if (/^(مؤلف|باب|عنوان|محرر|ناشر|مترجم|سنة|وصف)\s*=/.test(t)) return '';
  return t;
}

const hasFlag = (name) => process.argv.includes(`--${name}`);

const LANG = arg('lang', 'ar');
const LIMIT = Number(arg('limit', 100));
const SCAN_PAGES = Number(arg('scan', 240));      // 500 titles per scan page
const MIN_SUB = Number(arg('minsub', 3));
const MAX_CH = Number(arg('maxch', 18));
const MIN_WORDS = Number(arg('minwords', 3000));
const DRY = hasFlag('dry');

const API = `https://${LANG}.wikisource.org/w/api.php`;
const SITE = `https://${LANG}.wikisource.org/wiki/`;
const UA = 'QirtasBot/1.0 (public-domain library builder; contact: qirtas@example.org)';

async function api(params, tries = 3) {
  const qs = new URLSearchParams({ format: 'json', origin: '*', ...params }).toString();
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchPolite(`${API}?${qs}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(1200 * (i + 1));
    }
  }
  throw lastErr;
}

const SKIP_ROOT = LANG === 'ar'
  ? /^(قائمة|فهرس|بوابة|تصنيف|مؤلف|مستخدم|ويكي|نقاش|قالب|مساعدة|ملف|مخطوطات|مجلة)\b|^(ديوان العرب)$/
  : /^(List of|Index:|Portal:|Category:|Author:|Talk:|Template:|Help:|File:|Wikisource:|Page:)/i;

async function scanTitles() {
  const cacheFile = path.join(CACHE, `ws-titles-${LANG}.json`);
  if (fs.existsSync(cacheFile) && !hasFlag('rescan')) {
    const t = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    log(`titles cache: ${t.length} (use --rescan to refresh)`);
    return t;
  }
  const titles = [];
  let cont = null;
  for (let i = 0; i < SCAN_PAGES; i++) {
    const params = {
      action: 'query', list: 'allpages', apnamespace: '0',
      aplimit: '500', apfilterredir: 'nonredirects',
    };
    if (cont) params.apcontinue = cont;
    const j = await api(params);
    for (const p of j?.query?.allpages || []) titles.push(p.title);
    cont = j?.continue?.apcontinue;
    if (!cont) break;
    if (i % 40 === 39) log(`  scanned ${titles.length} titles…`);
    await sleep(120);
  }
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(titles));
  log(`scanned ${titles.length} main-namespace titles → ${cacheFile}`);
  return titles;
}

function groupRoots(titles) {
  const counts = new Map();
  for (const t of titles) {
    const i = t.indexOf('/');
    if (i < 2) continue;
    const root = t.slice(0, i).trim();
    counts.set(root, (counts.get(root) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([root, n]) => n >= MIN_SUB && !SKIP_ROOT.test(root) && root.length >= 3 && root.length <= 90)
    .sort((a, b) => b[1] - a[1]);
}

function cleanWikiValue(v) {
  return String(v || '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHeader(wikitext) {
  const field = (names) => {
    for (const n of names) {
      const re = new RegExp(`\\|\\s*${n}\\s*=\\s*([^\\n]*)`, 'i');
      const m = wikitext.match(re);
      if (m && cleanWikiValue(m[1])) return cleanWikiValue(m[1]);
    }
    return '';
  };
  return {
    title: field(['عنوان']),
    author: field(['مؤلف']),
    year: field(['سنة', 'تاريخ']),
    translator: field(['مترجم']),
    notes: field(['ملاحظات']),
  };
}

function htmlToParagraphs(html) {
  const $ = cheerio.load(html);
  const out = $('.mw-parser-output').clone();
  if (!out.length) return [];
  out.find(
    'table, style, script, .mw-editsection, .noprint, .ws-noexport, .navbox, .sidebar, .hatnote, ' +
    '.toc, .mw-references-wrap, .error, .thumb, .licenseContainer, div.printfooter, .mw-jump-link, ' +
    '.ws-page-header, .pagenum, .mw-empty-elt, sup.reference'
  ).remove();
  const paragraphs = [];
  out.find('p, li, dd, blockquote').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 2 && !/^\[?\d+\]?$/.test(text) && !/^\.{3,}$/.test(text)) paragraphs.push(text);
  });
  return paragraphs;
}

async function renderPage(title) {
  const j = await api({ action: 'parse', page: title, prop: 'text', disablelimitreport: '1', redirects: '1' });
  if (j?.error) throw new Error(j.error.info || 'parse error');
  return j.parse.text['*'];
}

async function subpages(root) {
  const out = [];
  let cont = null;
  for (let i = 0; i < 4; i++) {
    const params = {
      action: 'query', list: 'allpages', apnamespace: '0',
      apprefix: root + '/', aplimit: '200', apfilterredir: 'nonredirects',
    };
    if (cont) params.apcontinue = cont;
    const j = await api(params);
    for (const p of j?.query?.allpages || []) out.push(p.title);
    cont = j?.continue?.apcontinue;
    if (!cont) break;
  }
  return out;
}

(async () => {
  fs.mkdirSync(CACHE, { recursive: true });
  const catalog = readCatalog();
  const have = new Set(catalog.map((b) => b.sourceUrl || ''));
  const slugs = new Set(catalog.map((b) => b.id));
  const usedTitles = new Set(catalog.map((b) => (b.title && (b.title.ar || b.title.en)) || ''));

  log(`wikisource[${LANG}] — scanning…`);
  const titles = await scanTitles();
  const roots = groupRoots(titles);
  log(`candidate books (>=${MIN_SUB} subpages): ${roots.length}`);

  const report = [];
  let added = 0;

  for (const [root, subCount] of roots) {
    if (added >= LIMIT) break;
    const sourceUrl = SITE + encodeURIComponent(root.replace(/\s+/g, '_'));
    if (have.has(sourceUrl) || usedTitles.has(root)) { continue; }

    try {
      let header = { title: '', author: '', year: '', translator: '' };
      try {
        const wj = await api({ action: 'parse', page: root, prop: 'wikitext', section: '0', redirects: '1' });
        if (wj?.parse?.wikitext?.['*']) header = parseHeader(wj.parse.wikitext['*']);
      } catch (e) { /* header optional */ }

      const subs = await subpages(root);
      if (subs.length < MIN_SUB) { report.push({ root, status: 'SKIP', reason: 'few subpages' }); continue; }
      const picked = subs.slice(0, MAX_CH);

      const chapters = [];
      for (const t of picked) {
        let paragraphs = [];
        try {
          const html = await renderPage(t);
          paragraphs = htmlToParagraphs(html);
        } catch (e) { paragraphs = []; }
        if (paragraphs.length > 600) paragraphs = paragraphs.slice(0, 600);
        if (paragraphs.length < 1) continue;
        const label = t.split('/').slice(1).join(' / ') || t;
        const chapter = { title: { ar: label, en: label }, paragraphs };
        if (isJunkChapter(chapter)) continue; // skip redirects/stubs/near-empty pages
        chapters.push(chapter);
        await sleep(220);
      }

      const words = chapters.reduce((n, c) => n + countWords(c.paragraphs), 0);
      if (chapters.length < 2 || words < MIN_WORDS) {
        report.push({ root, status: 'SKIP', reason: `thin (${chapters.length} ch, ${words} w)` });
        log(`  ✗ ${root} — thin (${chapters.length} ch, ${words} w)`);
        continue;
      }

      const title = cleanField(header.title) || root;
      const author = cleanField(header.author) || (LANG === 'ar' ? 'مؤلف غير معروف' : 'Unknown author');
      let id = arSlug(title, LANG === 'ar' ? 'ar' : 'ws');
      if (slugs.has(id)) id = `${id}-${LANG}`;
      if (slugs.has(id)) { report.push({ root, status: 'SKIP', reason: 'slug clash' }); continue; }
      slugs.add(id);
      usedTitles.add(root);

      const cat = LANG === 'ar' ? 'arabic' : 'english';
      const entry = {
        id,
        source: 'wikisource',
        sourceKey: 'wikisource',
        sourceUrl,
        title: LANG === 'ar'
          ? { ar: title, en: title }
          : { ar: title, en: title },
        author: LANG === 'ar'
          ? { ar: author, en: author }
          : { ar: author, en: author },
        deathYear: null,
        year: header.year || null,
        lang: LANG,
        cat,
        description: {
          ar: `${title}${author ? ' — ' + author : ''}. نص كامل من الملكية العامة منشور على ويكي مصدر${LANG === 'ar' ? ' العربية' : ''}، مقروء مجاناً على منصة قِرطاس.`,
          en: `${title}${author ? ' by ' + author : ''}. Full public-domain text from Wikisource, free to read on Qirtas.`,
        },
        grad: COVERS[catalog.length % COVERS.length],
        emoji: EMOJIS[catalog.length % EMOJIS.length],
        chapters: chapters.length,
        words,
        addedAt: new Date().toISOString().slice(0, 10),
      };

      saveText({ id, chapters });
      catalog.push(entry);
      have.add(sourceUrl);
      added++;
      report.push({ root, status: 'OK', id, chapters: chapters.length, words, subs: subs.length, picked: picked.length });
      log(`  ✓ [${added}/${LIMIT}] ${id} — ${chapters.length} ch, ${words} w  (${root})`);
      if (added % 10 === 0 && !DRY) writeCatalog(catalog);
      await sleep(320);
    } catch (e) {
      report.push({ root, status: 'ERR', reason: String(e.message || e).slice(0, 90) });
      log(`  ! ${root} — ${String(e.message || e).slice(0, 70)}`);
      await sleep(500);
    }
  }

  fs.writeFileSync(path.join(CACHE, `ws-mass-report-${LANG}.json`), JSON.stringify(report, null, 2));
  if (!DRY) writeCatalog(catalog);
  const ok = report.filter((r) => r.status === 'OK');
  log(`DONE[${LANG}] — added ${ok.length}, catalog total ${catalog.length}`);
  log(`  total words added: ${ok.reduce((n, r) => n + r.words, 0).toLocaleString('en-US')}`);
})();
