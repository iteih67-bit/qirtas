// Device-width verification: opens the site at phone / tablet / laptop / desktop
// widths, asserts layout invariants, and saves a screenshot for each.
// Usage: node tools/width-check.js --base=http://localhost:8081 [--out=cache/screens]
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BASE = argOf('base', 'http://localhost:8081');
const PORT = Number(argOf('port', 9377));
const OUT = argOf('out', path.join(__dirname, '..', 'cache', 'screens'));
const BROWSER = argOf('browser', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const PROFILE = path.join(os.tmpdir(), 'qirtas-width-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WIDTHS = [
  { name: 'phone-360', w: 360, h: 740, mobile: true },
  { name: 'phone-414', w: 414, h: 896, mobile: true },
  { name: 'tablet-768', w: 768, h: 1024, mobile: true },
  { name: 'laptop-1280', w: 1280, h: 800, mobile: false },
  { name: 'desktop-1440', w: 1440, h: 900, mobile: false },
];

function httpJSON(method, url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let s = ''; res.on('data', (c) => (s += c));
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { resolve(s); } });
    });
    req.on('error', reject); req.end();
  });
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) { c.pending.get(m.id)(m); c.pending.delete(m.id); }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); resolve({ __timeout: true }); } }, 30000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r && r.result && r.result.result ? r.result.result.value : { error: 'no result' };
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
  let version = null;
  for (let i = 0; i < 40; i++) {
    try { version = await httpJSON('GET', `http://127.0.0.1:${PORT}/json/version`); if (version && version.webSocketDebuggerUrl) break; } catch (e) {}
    await sleep(400);
  }
  if (!version) { console.log(JSON.stringify({ error: 'browser did not start' })); process.exit(2); }

  const target = await httpJSON('PUT', `http://127.0.0.1:${PORT}/json/new?about:blank`);
  const cdp = await CDP.attach(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');

  const arabicId = await (async () => {
    const r = await httpGetJSON(`${BASE}/books-index.json`);
    const ar = (r.books || []).filter((b) => b.lang === 'ar').sort((a, b) => (b.w || 0) - (a.w || 0))[0];
    return ar ? ar.id : (r.books[0] || {}).id;
  })();

  function httpGetJSON(url) {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } }); }).on('error', reject);
    });
  }

  const pages = [
    { name: 'library', url: '/library/' },
    { name: 'book', url: `/book/${encodeURIComponent(arabicId)}/` },
    { name: 'reader', url: `/read/${encodeURIComponent(arabicId)}/` },
    { name: 'rights', url: '/rights/' },
    { name: 'authors', url: '/authors/' },
    { name: 'author', url: '/author/agatha-christie/' },
    { name: 'era', url: '/era/trath-arby/' },
    { name: 'home', url: '/' },
  ];

  const results = [];
  for (const d of WIDTHS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: d.w, height: d.h, deviceScaleFactor: 1, mobile: d.mobile,
    });
    for (const pg of pages) {
      await cdp.send('Page.navigate', { url: BASE + pg.url });
      await sleep(pg.name === 'reader' ? 4200 : 2600);
      const m = await cdp.eval(`(() => {
        const de = document.documentElement;
        const overflowX = de.scrollWidth - de.clientWidth;
        const cs = (sel) => { const el = document.querySelector(sel); if (!el) return null; const c = getComputedStyle(el); return { font: c.fontSize, line: c.lineHeight, cols: c.columnCount }; };
        const reader = document.getElementById('readerContent');
        return {
          width: innerWidth,
          overflowX: overflowX,
          bodyFont: getComputedStyle(document.body).fontFamily.split(',')[0],
          reader: reader ? { paras: reader.querySelectorAll('p').length, font: getComputedStyle(reader).fontSize, line: getComputedStyle(reader).lineHeight, dir: reader.dir, cols: getComputedStyle(reader).columnCount } : null,
          pageIndicator: (document.getElementById('pageIndicator') || {}).textContent || null,
          cards: document.querySelectorAll('.book-card').length,
          toolbarVisible: !!document.querySelector('.lib-toolbar'),
          sourceBox: !!document.querySelector('.source-box'),
          rightsForm: !!document.getElementById('rightsForm'),
          toolsVisible: (() => { const t = document.querySelector('.reader-tools'); if (!t) return null; const r = t.getBoundingClientRect(); return { right: Math.round(r.right), width: Math.round(r.width), inViewport: r.right <= innerWidth + 1 && r.left >= -1 }; })(),
          heroSearch: !!document.querySelector('.hero-search'),
        };
      })()`);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(OUT, `${pg.name}-${d.name}.png`);
      if (shot && shot.result && shot.result.data) fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      results.push({ device: d.name, page: pg.name, file: path.basename(file), ...m });
    }
  }

  cdp.ws.close();
  try { proc.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 2 }); } catch (e) {}

  const failures = [];
  for (const r of results) {
    if (r.overflowX > 1) failures.push(`${r.page}@${r.device}: overflowX=${r.overflowX}`);
    if (r.page === 'reader' && (!r.reader || r.reader.paras === 0)) failures.push(`reader@${r.device}: no paragraphs`);
    if (r.page === 'reader' && r.toolsVisible && !r.toolsVisible.inViewport) failures.push(`reader@${r.device}: tools overflow`);
    if (r.page === 'library' && r.cards === 0) failures.push(`library@${r.device}: no cards`);
    if (r.page === 'rights' && !r.rightsForm) failures.push(`rights@${r.device}: no form`);
  }

  const summary = {
    base: BASE, browser: version.Browser, arabicSampleBook: arabicId,
    screenshotsDir: OUT, checks: results.length, failures,
  };
  fs.writeFileSync(path.join(OUT, 'width-report.json'), JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify({ summary, results }, null, 2));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.log(JSON.stringify({ error: String(e && e.stack || e) })); process.exit(2); });
