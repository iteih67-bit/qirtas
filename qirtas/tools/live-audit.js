// live-audit.js — real-browser audit of a Qirtas deployment (local or live).
// Records console errors, failed/4xx requests and the outcome of real interactions.
// Usage: node tools/live-audit.js --base=https://site [--port=9400] [--out=cache]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BASE = argOf('base', 'http://localhost:8081').replace(/\/$/, '');
const PORT = Number(argOf('port', 9400));
const OUT = argOf('out', path.join(__dirname, '..', 'cache'));
const BROWSER = argOf('browser', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const PROFILE = path.join(os.tmpdir(), 'qirtas-audit-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJSON(method, url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { resolve(s); } }); });
    req.on('error', reject); req.end();
  });
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.id && c.pending.has(m.id)) { c.pending.get(m.id)(m); c.pending.delete(m.id); }
      else if (m.method) c.events.push(m);
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); resolve({ __timeout: true }); } }, 25000);
    });
  }
  async evalExpr(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r && r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.text };
    if (r && r.result && r.result.result) return r.result.result.value;
    return { error: 'no result' };
  }
  async goto(url, waitMs = 2600) { await this.send('Page.navigate', { url }); await sleep(waitMs); }
  drain(problems) {
    for (const e of this.events) {
      if (e.method === 'Runtime.exceptionThrown') {
        const d = e.params.exceptionDetails;
        problems.consoleErrors.push(String((d.exception && d.exception.description) || d.text || '').split('\n')[0].slice(0, 220));
      } else if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') {
        problems.consoleErrors.push(e.params.args.map((a) => String(a.value || a.description || '')).join(' ').slice(0, 220));
      } else if (e.method === 'Network.loadingFailed') {
        problems.failedRequests.push(String(e.params.errorText).slice(0, 120));
      } else if (e.method === 'Network.responseReceived' && e.params.response.status >= 400) {
        problems.missingResources.push(e.params.response.status + ' ' + e.params.response.url.replace(BASE, ''));
      }
    }
    this.events.length = 0;
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 40; i++) {
    try { version = await httpJSON('GET', `http://127.0.0.1:${PORT}/json/version`); if (version && version.webSocketDebuggerUrl) break; } catch (e) {}
    await sleep(400);
  }
  if (!version || !version.webSocketDebuggerUrl) { console.log(JSON.stringify({ error: 'browser did not start' })); try { proc.kill(); } catch (e) {} process.exit(2); }

  const target = await httpJSON('PUT', `http://127.0.0.1:${PORT}/json/new?about:blank`);
  const cdp = await CDP.attach(target.webSocketDebuggerUrl || (target.result && target.result.webSocketDebuggerUrl));
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');

  // links in the built site already carry the deployed base (e.g. /qirtas/book/x/)
  const BASE_PATH = new URL(BASE).pathname.replace(/\/$/, '');
  const rel = (href) => (BASE_PATH && href.startsWith(BASE_PATH)) ? href.slice(BASE_PATH.length) || '/' : href;
  const problems = { consoleErrors: [], failedRequests: [], missingResources: [] };
  const results = [];
  const step = async (name, url, fn, wait = 2600) => {
    await cdp.goto(BASE + url, wait);
    let r = null;
    try { r = fn ? await fn() : null; } catch (e) { r = { error: String(e.message) }; }
    cdp.drain(problems);
    results.push({ name, url, result: r });
    return r;
  };

  await step('home', '/', () => cdp.evalExpr(`(() => ({ title: document.title, cards: document.querySelectorAll('.book-card').length, hasSearch: !!document.getElementById('homeSearch'), selects: document.querySelectorAll('select').length, links: document.querySelectorAll('a').length }))()`));
  await step('library', '/library/', () => cdp.evalExpr(`(() => ({ cards: document.querySelectorAll('.book-card').length, status: (document.getElementById('libStatus')||{}).textContent.trim().slice(0,80), selects: document.querySelectorAll('select').length, pager: (document.getElementById('pageInfo')||{}).textContent }))()`), 3400);
  await step('library-search-ar', '/library/', async () => {
    await cdp.evalExpr(`(() => { const i = document.getElementById('libSearch'); i.value = 'ابن القيم'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await sleep(1200);
    return cdp.evalExpr(`(() => ({ cards: document.querySelectorAll('.book-card').length, status: (document.getElementById('libStatus')||{}).textContent.trim().slice(0,90), url: location.search }))()`);
  }, 3400);
  await step('library-no-results', '/library/', async () => {
    await cdp.evalExpr(`(() => { const i = document.getElementById('libSearch'); i.value = 'zzqqxx'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await sleep(1200);
    return cdp.evalExpr(`(() => ({ cards: document.querySelectorAll('.book-card').length, empty: !!document.querySelector('.lib-empty'), resetBtn: !!document.getElementById('libResetEmpty') }))()`);
  }, 3400);
  await step('library-pagination', '/library/?page=2', () => cdp.evalExpr(`(() => ({ cards: document.querySelectorAll('.book-card').length, pager: (document.getElementById('pageInfo')||{}).textContent }))()`), 3400);
  await step('library-external', '/library/', async () => {
    const clicked = await cdp.evalExpr(`(() => { const b = document.getElementById('extLoad'); if (!b) return false; b.click(); return true; })()`);
    await sleep(2600);
    return cdp.evalExpr(`(() => ({ clicked: ${JSON.stringify(clicked)}, rows: document.querySelectorAll('.ext-list li').length, outbound: document.querySelectorAll('.ext-list a[href^="http"]').length, badge: !!document.querySelector('.ext-badge') }))()`);
  }, 3400);
  await step('authors', '/authors/', () => cdp.evalExpr(`(() => ({ chips: document.querySelectorAll('.author-chip').length }))()`));
  await step('stats', '/stats/', () => cdp.evalExpr(`(() => ({ tables: document.querySelectorAll('table').length, text: document.body.textContent.replace(/\\s+/g,' ').slice(0, 130) }))()`));
  await step('about', '/about/', () => cdp.evalExpr(`(() => ({ chars: document.body.textContent.length, mentionsSource: /wikisource|gutenberg|openlibrary|archive\\.org|cloudflare|pages\\.dev/i.test(document.documentElement.innerHTML) }))()`));
  await step('rights', '/rights/', () => cdp.evalExpr(`(() => ({ form: !!document.querySelector('form'), fields: document.querySelectorAll('form input, form textarea, form select').length }))()`));
  await step('contact', '/contact/', () => cdp.evalExpr(`(() => ({ text: document.body.textContent.length }))()`));
  await step('privacy', '/privacy/', () => cdp.evalExpr(`(() => ({ text: document.body.textContent.length }))()`));
  await step('404', '/no-such-page-xyz/', () => cdp.evalExpr(`(() => ({ title: document.title, links: document.querySelectorAll('a').length }))()`));

  // full click-through: home card -> book page -> reader
  const href = await step('flow-book', '/', async () => {
    const h = await cdp.evalExpr(`(() => { const a = document.querySelector('.book-card'); return a ? a.getAttribute('href') : null; })()`);
    if (!h) return { error: 'no card' };
    await cdp.goto(BASE + rel(h), 2800);
    return cdp.evalExpr(`(() => ({ href: ${JSON.stringify(h)}, title: document.title, readLink: !!document.querySelector('a[href^="/read/"]'), epub: !!document.querySelector('a[href$=".epub"]'), rights: /حقوق/.test(document.body.textContent), tocItems: document.querySelectorAll('ol li a[href*="?ch="]').length }))()`);
  });

  let idx = null;
  try {
    const jj = await (await fetch(BASE + '/books-index.json')).json();
    const books = (jj && jj.books) || [];
    const arBook = books.find((b) => b.lang === 'ar') || books[0];
    idx = arBook ? { id: arBook.id } : null;
  } catch (e) { idx = null; }

  if (idx && idx.id) {
    await cdp.goto(`${BASE}/read/${encodeURIComponent(idx.id)}/`, 7000);
    const reader = await cdp.evalExpr(`(() => ({ book: document.title.slice(0,60), paragraphs: document.querySelectorAll('#readerContent p').length, pages: (document.getElementById('pageInfo')||{}).textContent, toolbar: !!document.getElementById('readerBar'), fatal: !!document.getElementById('readerFatal') }))()`);
    cdp.drain(problems);
    results.push({ name: 'reader-render', url: '/read/' + idx.id + '/', result: reader });
    const clicked = await cdp.evalExpr(`(() => { const b = document.getElementById('nextPage'); if (!b) return false; b.click(); return true; })()`);
    await sleep(1500);
    const after = await cdp.evalExpr(`(() => ({ indicator: (document.getElementById('pageIndicator')||{}).textContent, paragraphs: document.querySelectorAll('#readerContent p').length }))()`);
    results.push({ name: 'reader-next', url: '/read/' + idx.id + '/', result: { clicked, after } });
    cdp.drain(problems);
  }

  const report = { base: BASE, when: new Date().toISOString(), results, problems };
  fs.writeFileSync(path.join(OUT, 'live-audit.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 1));
  cdp.close(); try { proc.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('audit failed: ' + e.message); process.exit(1); });
