// Qirtas smoke test — boots the static server on a free port and verifies the
// generated site end-to-end (routes, counts, sitemap coverage, JSON payloads).
// Usage: node tools/smoke-test.js [--port=8099] [--sample=8]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'site', 'dist');
const DATA = path.join(ROOT, 'books-data');
const PORT = Number((process.argv.find((a) => a.startsWith('--port=')) || '').split('=')[1] || 8099);
const SAMPLE = Number((process.argv.find((a) => a.startsWith('--sample=')) || '').split('=')[1] || 8);

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ttf': 'font/ttf' };

function serve() {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const fp = path.join(DIST, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!fp.startsWith(DIST)) { res.writeHead(403); return res.end('forbidden'); }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  }).listen(PORT);
}

const get = (url) => new Promise((resolve) => {
  const req = http.get(`http://127.0.0.1:${PORT}${url}`, (res) => {
    let n = 0;
    res.on('data', (c) => { n += c.length; });
    res.on('end', () => resolve({ status: res.statusCode, bytes: n, type: res.headers['content-type'] || '' }));
  });
  req.on('error', (e) => resolve({ status: 0, bytes: 0, error: e.message }));
  req.setTimeout(20000, () => { req.destroy(); resolve({ status: 0, bytes: 0, error: 'timeout' }); });
});

(async () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(DATA, 'catalog.json'), 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
  const sample = [...catalog].sort(() => Math.random() - 0.5).slice(0, SAMPLE);

  const server = serve();
  const results = [];
  const check = async (label, url, expect) => {
    const r = await get(url);
    const ok = Array.isArray(expect) ? expect.includes(r.status) : r.status === expect;
    results.push({ label, url, status: r.status, bytes: r.bytes, ok, error: r.error });
    return r;
  };

  await check('الرئيسية', '/', 200);
  await check('المكتبة', '/library/', 200);
  await check('الإحصاءات', '/stats/', 200);
  await check('عن المنصة', '/about/', 200);
  await check('تصنيف عربي', '/category/arabic/', 200);
  await check('تصنيف إنجليزي', '/category/english/', 200);
  await check('فهرس البحث JSON', '/books-index.json', 200);
  await check('الكتالوج JSON', '/catalog.json', 200);
  await check('RSS', '/feed.xml', 200);
  await check('خريطة الموقع', '/sitemap.xml', 200);
  await check('robots', '/robots.txt', 200);
  await check('manifest', '/manifest.webmanifest', 200);
  await check('Service Worker', '/assets/sw.js', 200);
  await check('CSS', '/assets/css/site.css', 200);
  await check('CSS v2', '/assets/css/library.css', 200);
  await check('JS القارئ', '/assets/js/reader.js', 200);
  await check('JS المكتبة', '/assets/js/library.js', 200);
  await check('خط عربي', '/fonts/NotoNaskhArabic-Variable.ttf', 200);
  await check('أيقونة', '/icons/icon-512.png', 200);
  await check('مسار غير موجود (404)', '/this-page-does-not-exist/', 404);

  for (const b of sample) {
    await check(`كتاب: ${b.id}`, `/book/${encodeURIComponent(b.id)}/`, 200);
    await check(`قارئ: ${b.id}`, `/read/${encodeURIComponent(b.id)}/`, 200);
    const t = await check(`نص: ${b.id}`, `/books/${encodeURIComponent(b.id)}.json`, 200);
    if (t.status === 200) {
      const body = await new Promise((resolve) => {
        http.get(`http://127.0.0.1:${PORT}/books/${encodeURIComponent(b.id)}.json`, (res) => {
          let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => resolve(s));
        });
      });
      try {
        const j = JSON.parse(body);
        const ch = (j.chapters || []).length;
        const paras = (j.chapters || []).reduce((n, c) => n + (c.paragraphs || []).length, 0);
        results.push({ label: `تحقق محتوى: ${b.id}`, url: '', status: ch > 0 && paras > 0 ? 200 : 0, bytes: paras, ok: ch > 0 && paras > 0, error: `${ch} فصل / ${paras} فقرة` });
      } catch (e) {
        results.push({ label: `تحقق محتوى: ${b.id}`, url: '', status: 0, bytes: 0, ok: false, error: 'JSON غير صالح' });
      }
    }
  }

  server.close();

  // sitemap coverage
  const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  let missing = 0;
  for (const loc of locs) {
    const p = loc.replace(/^https?:\/\/[^/]+/, '');
    const fp = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
    if (!fs.existsSync(fp)) { missing++; if (missing <= 5) console.log('  missing in dist: ' + p); }
  }

  const booksInDist = fs.existsSync(path.join(DIST, 'book')) ? fs.readdirSync(path.join(DIST, 'book')).length : 0;
  const textsInDist = fs.existsSync(path.join(DIST, 'books')) ? fs.readdirSync(path.join(DIST, 'books')).length : 0;
  const textsInData = fs.readdirSync(path.join(DATA, 'texts')).length;

  console.log('\n== فحص HTTP ==');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${String(r.status).padStart(3)}  ${String(r.bytes).padStart(9)}  ${r.label}${r.error ? '  [' + r.error + ']' : ''}${r.url ? '  ' + r.url : ''}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log('\n== إحصاءات ==');
  console.log(`الكتالوج: ${catalog.length}   فهرس البحث: ${index.count}   نصوص: ${textsInData}`);
  console.log(`صفحات كتاب في dist: ${booksInDist}   ملفات نص في dist: ${textsInDist}`);
  console.log(`سطور sitemap: ${locs.length}   مفقودة: ${missing}`);
  console.log(`فحوص ناجحة: ${results.length - failed.length}/${results.length}`);
  if (failed.length) { console.log('فشل:'); for (const f of failed) console.log('  - ' + f.label); }
  process.exit(failed.length || missing ? 1 : 0);
})();
