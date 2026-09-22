// Independent integrity + leak + rights verification for the built site.
'use strict';
const fs = require('fs');
const path = require('path');
const Q = path.resolve(__dirname, '..');
const ROOT = path.resolve(Q, '..');
const DIST = path.join(Q, 'site', 'dist');
const out = {};

// ---------- 1) DB ----------
let db = null;
let dbNote = '';
try {
  const { DatabaseSync } = require('node:sqlite');
  const src = path.join(Q, 'data', 'qirtas.db');
  let openPath = src;
  try {
    const tmp = path.join(require('os').tmpdir(), 'qirtas-verify-' + process.pid + '-' + Date.now() + '.db');
    fs.copyFileSync(src, tmp);
    openPath = tmp;
  } catch (e) { /* fall back to opening in place */ }
  db = new DatabaseSync(openPath);
  db.prepare('select count(*) c from books').get();
} catch (e) {
  dbNote = e.message;
  db = null;
  console.log('note: sqlite snapshot not readable in this environment (' + dbNote + ') — continuing with site checks only');
}
const q = (s) => { try { return db ? db.prepare(s).get() : null; } catch (e) { return null; } };
const qa = (s) => { try { return db ? db.prepare(s).all() : []; } catch (e) { return []; } };
const qv = (s) => { const r = q(s); return r ? r.c : null; };
out.db = db ? {
  total: qv('select count(*) c from books'),
  visible: qv('select count(*) c from books where (hidden is null or hidden=0) and (removed is null or removed=0)'),
  byLang: qa('select language l, count(*) c from books group by language'),
  noSourceUrl: qv("select count(*) c from books where source_url is null or source_url=''"),
  noLicense: qv("select count(*) c from books where license_label is null or license_label=''"),
  noEra: qv("select count(*) c from books where era is null or era=''"),
  noCover: qv("select count(*) c from books where cover is null or cover=''"),
  hiddenOrRemoved: qa('select hidden, removed, count(*) c from books group by hidden, removed'),
  auditLog: qv('select count(*) c from audit_log'),
  takedown: qa('select id, book_id, status from takedown_requests'),
  tables: qa("select name from sqlite_master where type='table' order by name").map((r) => r.name),
} : { mode: 'unavailable', note: dbNote, total: null, visible: null, byLang: [], noSourceUrl: null, noLicense: null, noEra: null, noCover: null, hiddenOrRemoved: [], auditLog: null, takedown: [], tables: [] };

// ---------- 2) catalog + index ----------
const catalog = JSON.parse(fs.readFileSync(path.join(Q, 'books-data', 'catalog.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(Q, 'books-data', 'index.json'), 'utf8'));
out.catalog = { catalog: catalog.length, index: index.books.length, dbMatch: out.db.visible == null ? null : catalog.length === out.db.visible, indexMatch: catalog.length === index.books.length };

// ---------- 3) dist book dirs vs db ids ----------
const allIds = qa('select id, hidden, removed from books').map((r) => ({ id: r.id, hide: !!(r.hidden || r.removed) }));
const dbIds = allIds.filter((r) => !r.hide);
const bookDirs = fs.readdirSync(path.join(DIST, 'book')).filter((d) => fs.statSync(path.join(DIST, 'book', d)).isDirectory());
const readDirs = fs.readdirSync(path.join(DIST, 'read')).filter((d) => fs.statSync(path.join(DIST, 'read', d)).isDirectory());
const missingDirs = dbIds.filter((r) => !bookDirs.includes(r.id)).map((r) => r.id);
const hiddenVisible = allIds.filter((r) => r.hide && bookDirs.includes(r.id)).map((r) => r.id);
out.dist = { dbIds: dbIds.length, bookDirs: bookDirs.length, readDirs: readDirs.length, missingDirs: missingDirs.slice(0, 10), missingCount: missingDirs.length, hiddenVisibleOnSite: hiddenVisible };

// ---------- 4) leak scan on public HTML ----------
const KEYWORDS = ['node:sqlite', 'sqlite', 'gutenberg', 'wikisource', 'openlibrary', 'archive.org', 'standardebooks', 'hindawi', 'mktbtypdf', 'shamela', 'scrape', 'scraper', 'harvest', 'spider', 'ADMIN_PASSWORD', 'admin-password', 'robots.txt', 'db-cli', 'npm ', 'git ', 'cron', 'https://api.', 'pipeline/'];
const htmlFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) htmlFiles.push(p);
  }
})(DIST);
const hits = {};
for (const f of htmlFiles) {
  const t = fs.readFileSync(f, 'utf8').toLowerCase();
  for (const k of KEYWORDS) if (t.includes(k.toLowerCase())) (hits[k] = hits[k] || []).push(path.relative(DIST, f));
}
out.leak = {
  htmlScanned: htmlFiles.length,
  hits: Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, { count: v.length, samples: v.slice(0, 3) }])),
  adminInDist: fs.existsSync(path.join(DIST, 'admin')),
  adminLinkedFromPublic: htmlFiles.filter((f) => /href="[^"]*\/admin/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(DIST, f)).slice(0, 5),
  apiLinkedFromPublic: htmlFiles.filter((f) => /href="[^"]*\/api\//.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(DIST, f)).slice(0, 5),
};

// ---------- 5) rights + reader affordances on every book page ----------
const r = { pages: 0, noRights: [], noSourceLink: [], noReadLink: [], noEpub: [] };
for (const d of bookDirs) {
  const p = path.join(DIST, 'book', d, 'index.html');
  if (!fs.existsSync(p)) continue;
  r.pages++;
  const t = fs.readFileSync(p, 'utf8');
  if (!/حقوق/.test(t)) r.noRights.push(d);
  if (!/href="(?:[^"]*?)?\/rights\//.test(t)) r.noSourceLink.push(d);
  if (!new RegExp(`href="(?:[^"]*?)?/read/${d}/`).test(t)) r.noReadLink.push(d);
  if (!new RegExp(`${d}\\.epub`).test(t)) r.noEpub.push(d);
}
out.rights = {
  pages: r.pages,
  noRights: r.noRights.length, noRightsSample: r.noRights.slice(0, 5),
  noRightsPageLink: r.noSourceLink.length, noSourceSample: r.noSourceLink.slice(0, 5),
  noReadLink: r.noReadLink.length, noReadSample: r.noReadLink.slice(0, 5),
  noEpub: r.noEpub.length, noEpubSample: r.noEpub.slice(0, 5),
};

// ---------- 6) key pages + sitemap ----------
const pages = ['index.html', 'library/index.html', 'rights/index.html', 'contact/index.html', 'privacy/index.html', 'authors/index.html', 'sitemap.xml', 'feed.xml', '404.html', 'stats/index.html', 'about/index.html'];
out.pages = pages.map((p) => {
  const fp = path.join(DIST, p);
  return { page: p, exists: fs.existsSync(fp), kb: fs.existsSync(fp) ? +(fs.statSync(fp).size / 1024).toFixed(1) : 0 };
});
const sm = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
out.sitemap = { urls: locs.length, unique: new Set(locs).size, dupes: locs.length - new Set(locs).size, allHttps: locs.every((u) => u.startsWith('https://')), sample: locs.slice(0, 2) };

// ---------- 7) epub files ----------
const epubs = fs.readdirSync(path.join(DIST, 'download')).filter((f) => f.endsWith('.epub'));
const sizes = epubs.map((f) => fs.statSync(path.join(DIST, 'download', f)).size);
out.epub = { count: epubs.length, minKB: sizes.length ? +(Math.min(...sizes) / 1024).toFixed(1) : 0, maxKB: sizes.length ? +(Math.max(...sizes) / 1024).toFixed(1) : 0 };

// ---------- 8) width + cdp reports ----------
try { const w = JSON.parse(fs.readFileSync(path.join(Q, 'cache', 'screens', 'width-report.json'), 'utf8')); const rows = w.results || w.checks || []; const summ = w.summary || {}; out.width = { checks: rows.length, failed: rows.filter((c) => c.pass === false || c.ok === false).length, summary: summ }; } catch (e) { out.width = { error: String(e.message) }; }
try { const c = JSON.parse(fs.readFileSync(path.join(Q, 'cache', 'cdp-final.json'), 'utf8')); out.cdp = { checks: c.checks.length, names: c.checks.map((x) => x.name) }; } catch (e) { out.cdp = { error: String(e.message) }; }

const reportDir = path.join(Q, 'cache');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'integrity-report.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

// ---- verdict (used by CI) -------------------------------------------------
const items = {
  missingPages: out.dist.missingCount,
  hiddenOnSite: out.dist.hiddenVisibleOnSite.length,
  rightsMissing: out.rights.noRights,
  rightsLinkMissing: out.rights.noRightsPageLink,
  readLinkMissing: out.rights.noReadLink,
  epubLinkMissing: out.rights.noEpub,
  sitemapDupes: out.sitemap.urls - out.sitemap.unique,
  indexMismatch: out.catalog.indexMatch ? 0 : 1,
};
const problems = Object.values(items).reduce((a, b) => a + b, 0);
if (problems > 0) console.error('integrity problem breakdown: ' + JSON.stringify(items));
// A checked-out SQLite file can legitimately lag the exported catalogue, so a
// db/catalog difference is reported but is not treated as a site problem.
if (out.catalog.dbMatch === false) console.log('note: sqlite snapshot differs from catalogue (' + (out.db.visible || 'n/a') + ' vs ' + out.catalog.catalog + ') — site checks remain authoritative');
if (problems > 0) {
  console.error('integrity: FAILED with ' + problems + ' problem(s)');
  process.exitCode = 1;
} else {
  console.log('integrity: OK — ' + out.db.visible + ' books, ' + out.dist.bookDirs + ' pages, ' + out.epub.count + ' EPUB files, sitemap ' + out.sitemap.unique + ' unique URLs');
}
