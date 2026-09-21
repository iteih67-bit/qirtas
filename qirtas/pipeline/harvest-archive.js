// harvest-archive.js — host Arabic full texts from Internet Archive, but only
// items that are genuinely free to redistribute: public domain, or carrying an
// explicit open licence. Lending/restricted items (inlibrary, printdisabled, or
// items whose text file is not publicly downloadable) are skipped by design.
//
// Usage:
//   node pipeline/harvest-archive.js --lang=ar --limit=120
//   node pipeline/harvest-archive.js --lang=ar --limit=120 --scan=3000 --dry
//   node pipeline/harvest-archive.js --lang=ar --rescan        (refresh candidate list)
'use strict';
const fs = require('fs');
const path = require('path');
const { readCatalog, writeCatalog, saveText, countWords, rawToParagraphs, fetchPolite, sleep, log, DATA, CACHE, COVERS, EMOJIS } = require('./lib/common');
const { normKey, arSlug } = require('./lib/arabic');

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const has = (n) => process.argv.includes(`--${n}`);

const LANG = argOf('lang', 'ar');
const LIMIT = Number(argOf('limit', 120));
const SCAN = Number(argOf('scan', LIMIT * 12));
const DRY = has('dry');
const RESCAN = has('rescan');

const CAND = path.join(CACHE, `archive-candidates-${LANG}.json`);
const REPORT = path.join(CACHE, `archive-run-${LANG}-${Date.now()}.json`);

const LANGQ = LANG === 'ar' ? '(Arabic OR ara OR "ar")' : '(English OR eng)';
const SEARCH_Q = `language:${LANGQ} AND mediatype:texts AND (possible-copyright-status:NOT_IN_COPYRIGHT OR licenseurl:[* TO *] OR collection:publicdomain OR collection:americana)`;
const RESTRICTED_COLLECTIONS = ['inlibrary', 'printdisabled', 'lendinglibrary', 'openlibrary'];

async function fetchText(url, retries = 2) { const res = await fetchPolite(url, retries); return res.text(); }

const num = (s) => String(s || '').replace(/[^\u0600-\u06FF]/g, '').length;
const arabicRatio = (s) => {
  const arabic = num(s);
  const letters = String(s).replace(/[^\p{L}]/gu, '').length || 1;
  return arabic / letters;
};

async function candidates() {
  if (!RESCAN && fs.existsSync(CAND)) {
    const j = JSON.parse(fs.readFileSync(CAND, 'utf8'));
    log(`candidates cache: ${j.length} (use --rescan to refresh)`);
    return j;
  }
  const out = [];
  const rowsPerPage = 100;
  const maxPages = Math.ceil(SCAN / rowsPerPage);
  for (let page = 1; page <= maxPages; page++) {
    const url = 'https://archive.org/advancedsearch.php?q=' + encodeURIComponent(SEARCH_Q)
      + '&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year&fl%5B%5D=language'
      + `&rows=${rowsPerPage}&page=${page}&output=json`;
    let j = null;
    try { j = JSON.parse(await fetchText(url)); } catch (e) { log('search page ' + page + ' failed: ' + e.message); break; }
    const docs = (j && j.response && j.response.docs) || [];
    if (!docs.length) break;
    for (const d of docs) if (d.identifier) out.push({ id: d.identifier, title: d.title, creator: d.creator, year: d.year });
    log(`scan page ${page}: +${docs.length} (total ${out.length})`);
    if (out.length >= SCAN) break;
    await sleep(400);
  }
  fs.mkdirSync(path.dirname(CAND), { recursive: true });
  fs.writeFileSync(CAND, JSON.stringify(out, null, 1));
  return out;
}

function licenseOf(meta) {
  const m = meta.metadata || {};
  const collections = [].concat(m.collection || []).map(String);
  if (collections.some((c) => RESTRICTED_COLLECTIONS.includes(c))) return { ok: false, why: 'restricted-collection' };
  const lic = String(m.licenseurl || '').trim();
  const status = String(m['possible-copyright-status'] || '').toUpperCase();
  if (lic) return { ok: true, label: /creativecommons\.org\/licenses\/by/i.test(lic) ? 'رخصة المشاع الإبداعي (نسبة المصنف)' : 'رخصة مفتوحة', url: lic, kind: 'open-license' };
  if (status.includes('NOT_IN_COPYRIGHT') || status.includes('PUBLIC DOMAIN')) return { ok: true, label: 'ملكية عامة', url: '', kind: 'public-domain' };
  const rights = String(m.rights || '').toLowerCase();
  if (rights.includes('public domain')) return { ok: true, label: 'ملكية عامة', url: '', kind: 'public-domain' };
  return { ok: false, why: 'no-open-license' };
}

function textFileOf(meta) {
  const files = (meta.files || []).map((f) => f.name).filter(Boolean);
  return files.find((n) => /_djvu\.txt$/i.test(n)) || files.find((n) => /(^|\/)[^/]*\.txt$/i.test(n) && !/meta|files|scandata|__ia_thumb/i.test(n)) || null;
}

async function downloadText(id, name) {
  const url = `https://archive.org/download/${encodeURIComponent(id)}/${name.split('/').map(encodeURIComponent).join('/')}`;
  const txt = await fetchText(url, 1);
  if (!txt || txt.length < 2000) throw new Error('text too small or empty (' + (txt ? txt.length : 0) + ' bytes)');
  return txt;
}

function toChapters(raw, title) {
  let t = String(raw).replace(/\r\n/g, '\n');
  t = t.replace(/^\s*This is a digital copy[\s\S]{0,1500}?(\n\n)/, '');
  const pages = t.split(/\f|\n\s*\n\s*(?=\d{1,4}\s*\n)/).map((p) => p.trim()).filter((p) => p.length > 40);
  const pool = pages.length >= 4 ? pages : t.split(/\n\s*\n\s*\n+/).map((p) => p.trim()).filter((p) => p.length > 40);
  const targetChapters = Math.min(18, Math.max(4, Math.round(pool.length / 12)));
  const per = Math.ceil(pool.length / targetChapters);
  const chapters = [];
  for (let i = 0; i < pool.length; i += per) {
    const chunk = pool.slice(i, i + per).join('\n\n');
    const paragraphs = rawToParagraphs(chunk);
    if (!paragraphs.length) continue;
    const label = (LANG === 'ar' ? 'الجزء ' : 'Part ') + (chapters.length + 1);
    chapters.push({ title: { ar: label, en: label }, paragraphs });
  }
  return chapters;
}

(async () => {
  const catalog = readCatalog();
  const slugs = new Set(catalog.map((b) => b.id));
  const hostedKeys = new Set(catalog.map((b) => normKey(`${(b.title && (b.title.ar || b.title.en)) || ''} ${(b.author && (b.author.ar || b.author.en)) || ''}`)));
  const hostedUrls = new Set(catalog.map((b) => b.sourceUrl));

  const list = await candidates();
  const report = [];
  let added = 0, scanned = 0;

  for (const c of list) {
    if (added >= LIMIT || scanned >= SCAN) break;
    const url = `https://archive.org/details/${encodeURIComponent(c.id)}`;
    if (hostedUrls.has(url)) { report.push({ id: c.id, status: 'SKIP', reason: 'already hosted' }); continue; }
    scanned++;
    try {
      const meta = JSON.parse(await fetchText(`https://archive.org/metadata/${encodeURIComponent(c.id)}`));
      const lic = licenseOf(meta);
      if (!lic.ok) { report.push({ id: c.id, status: 'SKIP', reason: lic.why }); await sleep(250); continue; }
      const fname = textFileOf(meta);
      if (!fname) { report.push({ id: c.id, status: 'SKIP', reason: 'no public text file' }); await sleep(250); continue; }

      const raw = await downloadText(c.id, fname);
      if (LANG === 'ar' && arabicRatio(raw) < 0.55) { report.push({ id: c.id, status: 'SKIP', reason: 'not mostly Arabic' }); await sleep(300); continue; }
      if (/^[0-9_\-.]+$/.test(String(c.id))) { report.push({ id: c.id, status: 'SKIP', reason: 'junk identifier' }); await sleep(150); continue; }

      const rawTitle = String(c.title || (meta.metadata && meta.metadata.title) || '').replace(/\s+/g, ' ').trim();
      if (rawTitle.length < 4 || /^[0-9_\-.]+$/.test(rawTitle)) { report.push({ id: c.id, status: 'SKIP', reason: 'no usable title' }); await sleep(150); continue; }
      const title = rawTitle.slice(0, 200);
      const author = String(c.creator || (meta.metadata && meta.metadata.creator) || '').replace(/\s+/g, ' ').trim().slice(0, 120)
        || (LANG === 'ar' ? 'مؤلف غير محدد' : 'Unknown author');
      const key = normKey(`${title} ${author}`);
      if (hostedKeys.has(key)) { report.push({ id: c.id, status: 'SKIP', reason: 'already hosted (title)' }); await sleep(200); continue; }

      const chapters = toChapters(raw, title);
      const words = chapters.reduce((s, ch) => s + countWords(ch.paragraphs), 0);
      if (chapters.length < 4 || words < 8000) { report.push({ id: c.id, status: 'SKIP', reason: `thin (${chapters.length} ch, ${words} w)` }); await sleep(200); continue; }

      let id = arSlug(title, LANG === 'ar' ? 'ar' : 'ia');
      if (slugs.has(id)) id = `${id}-ia`;
      if (slugs.has(id)) { report.push({ id: c.id, status: 'SKIP', reason: 'slug clash' }); continue; }
      slugs.add(id);
      hostedKeys.add(key);
      hostedUrls.add(url);

      const entry = {
        id,
        source: 'archiveorg',
        sourceKey: 'archiveorg',
        sourceUrl: url,
        license: lic.kind,
        licenseLabel: { ar: lic.label, en: 'Public domain' === lic.label ? 'Public domain' : lic.label },
        licenseUrl: lic.url || null,
        licenseAudit: `${lic.kind} via archive.org metadata (${new Date().toISOString().slice(0, 10)})`,
        title: { ar: title, en: title },
        author: { ar: author, en: author },
        deathYear: null,
        year: c.year || (meta.metadata && meta.metadata.year) || null,
        lang: LANG,
        cat: LANG === 'ar' ? 'arabic' : 'english',
        description: {
          ar: `${title} — ${author}. نص كامل من الملكية العامة منشور على أرشيف الإنترنت، متاح للقراءة والتنزيل مجاناً على قِرطاس.`,
          en: `${title} by ${author}. Full public-domain text from Internet Archive, free to read and download on Qirtas.`,
        },
        grad: COVERS[catalog.length % COVERS.length],
        emoji: EMOJIS[catalog.length % EMOJIS.length],
        chapters: chapters.length,
        words,
        addedAt: new Date().toISOString().slice(0, 10),
      };

      if (!DRY) { saveText({ id, chapters }); catalog.push(entry); }
      added++;
      report.push({ id: c.id, bookId: id, status: 'OK', license: lic.kind, chapters: chapters.length, words });
      log(`  ✓ [${added}/${LIMIT}] ${id} — ${chapters.length} ch, ${words} w (${lic.label})`);
      if (!DRY && added % 5 === 0) writeCatalog(catalog);
      await sleep(350);
    } catch (e) {
      report.push({ id: c.id, status: 'ERR', reason: String(e.message || e).slice(0, 120) });
      log(`  ✗ ${c.id} — ${String(e.message || e).slice(0, 80)}`);
      await sleep(300);
    }
  }

  if (!DRY) writeCatalog(catalog);
  fs.writeFileSync(REPORT, JSON.stringify({ lang: LANG, added, scanned, total: catalog.length, report }, null, 1));
  const by = {};
  for (const r of report) by[r.status] = (by[r.status] || 0) + 1;
  log(`DONE[${LANG}] — added ${added}, catalog total ${catalog.length}, report ${path.basename(REPORT)}`);
  log('statuses: ' + JSON.stringify(by));
  const skips = {};
  for (const r of report) if (r.status !== 'OK') skips[r.reason] = (skips[r.reason] || 0) + 1;
  log('skip reasons: ' + JSON.stringify(skips));
})();
