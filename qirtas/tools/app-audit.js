// app-audit.js — real-browser audit for the Qirtas reading app (SPA, hash-free views).
// Usage: node tools/app-audit.js --base=http://localhost:8090 [--port=9470]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BASE = argOf('base', 'http://localhost:8090').replace(/\/$/, '');
const PORT = Number(argOf('port', 9470));
const OUT = argOf('out', path.join(__dirname, '..', 'cache'));
const BROWSER = argOf('browser', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const PROFILE = path.join(os.tmpdir(), 'qirtas-app-audit-' + Date.now());
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
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
    const c = new CDP(ws); ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && c.pending.has(m.id)) { c.pending.get(m.id)(m); c.pending.delete(m.id); } else if (m.method) c.events.push(m); };
    return c;
  }
  send(m, p = {}) { const id = ++this.id; return new Promise((r) => { this.pending.set(id, r); this.ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); r({ __timeout: true }); } }, 30000); }); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.text }; return r.result && r.result.result ? r.result.result.value : null; }
  async goto(u, w = 2600) { await this.send('Page.navigate', { url: u }); await sleep(w); }
  drain(problems) {
    for (const e of this.events) {
      if (e.method === 'Runtime.exceptionThrown') problems.consoleErrors.push(String((e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description) || e.params.exceptionDetails.text || '').split('\n')[0].slice(0, 200));
      else if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') problems.consoleErrors.push(e.params.args.map((a) => String(a.value || a.description || '')).join(' ').slice(0, 200));
      else if (e.method === 'Network.loadingFailed') problems.failedRequests.push(String(e.params.errorText).slice(0, 120));
      else if (e.method === 'Network.responseReceived' && e.params.response.status >= 400) problems.missingResources.push(e.params.response.status + ' ' + e.params.response.url.replace(BASE, ''));
    }
    this.events.length = 0;
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  let v = null; for (let i = 0; i < 40; i++) { try { v = await httpJSON('GET', `http://127.0.0.1:${PORT}/json/version`); if (v && v.webSocketDebuggerUrl) break; } catch (e) {} await sleep(400); }
  if (!v) { console.log(JSON.stringify({ error: 'browser did not start' })); try { proc.kill(); } catch (e) {} process.exit(2); }
  const t = await httpJSON('PUT', `http://127.0.0.1:${PORT}/json/new?about:blank`);
  const cdp = await CDP.attach(t.webSocketDebuggerUrl || t.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');

  const problems = { consoleErrors: [], failedRequests: [], missingResources: [] };
  const results = [];
  const step = async (name, fn, wait = 1800) => {
    let r = null;
    try { r = fn ? await fn() : null; } catch (e) { r = { error: String(e.message) }; }
    cdp.drain(problems);
    results.push({ name, result: r });
    return r;
  };

  // 1) home view
  await cdp.goto(BASE + '/', 2600);
  const home = await step('home', () => cdp.eval(`(() => ({
    title: document.title,
    cards: document.querySelectorAll('.book-card, [data-book-id]').length,
    chips: document.querySelectorAll('[data-cat], .chip').length,
    search: !!document.querySelector('input[type="search"], #search, [data-search]'),
    langBtn: !!document.getElementById('langBtn') || !!document.querySelector('[data-lang]'),
    bodyChars: document.body.textContent.length
  }))()`), 2200);

  // 2) book detail via the first card click
  await step('open-first-book', async () => {
    const clicked = await cdp.eval(`(() => { const a = document.querySelector('.book-card, [data-book-id]'); if (!a) return false; a.click(); return true; })()`);
    await sleep(1800);
    const s = await cdp.eval(`(() => ({ clicked: ${JSON.stringify(clicked)}, reader: !!document.querySelector('#readerContent, .reader-stage, #reader, [data-reader]'), title: document.title.slice(0, 60), paragraphs: document.querySelectorAll('#readerContent p, .reader-stage p, [data-reader] p').length }))()`);
    return s;
  }, 2400);

  // 3) search in the app
  await cdp.goto(BASE + '/', 2200);
  const search = await step('search-arabic', async () => {
    await cdp.eval(`(() => { const i = document.querySelector('input[type="search"], #search, [data-search]'); if (!i) return false; i.value = 'ابن القيم'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('keyup', { bubbles: true })); return true; })()`);
    await sleep(1400);
    return cdp.eval(`(() => ({ cards: document.querySelectorAll('.book-card, [data-book-id]').length }))()`);
  }, 2200);

  // 4) language toggle if present
  await step('lang-toggle', async () => {
    const b = await cdp.eval(`(() => { const el = document.getElementById('langBtn') || document.querySelector('[data-lang]'); if (!el) return 'none'; el.click(); return 'clicked'; })()`);
    await sleep(900);
    const dir = await cdp.eval(`(() => ({ dir: document.documentElement.getAttribute('dir'), title: document.title.slice(0, 40) }))()`);
    return { toggle: b, after: dir };
  }, 2000);

  // 5) resource sanity: all referenced fonts/icons exist
  cdp.drain(problems);
  await cdp.goto(BASE + '/', 2200);
  const resources = await step('resources', async () => {
    await sleep(1200);
    return cdp.eval(`fetch('manifest.webmanifest').then(r=>({manifest:r.status}),e=>({manifest:'ERR '+e.message}))`);
  }, 2200);

  cdp.drain(problems);
  const report = { base: BASE, when: new Date().toISOString(), results, problems };
  fs.writeFileSync(path.join(OUT, 'app-audit.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 1));
  try { proc.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('app audit failed: ' + e.message); process.exit(1); });
