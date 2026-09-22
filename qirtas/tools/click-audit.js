// click-audit.js — link crawl + tap-target + weight/latency audit in a real browser.
//   node tools/click-audit.js --base=https://site [--port=9440] [--limit=120]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BASE = argOf('base', 'http://localhost:8081/qirtas').replace(/\/$/, '');
const PORT = Number(argOf('port', 9440));
const LIMIT = Number(argOf('limit', 120));
const OUT = argOf('out', path.join(__dirname, '..', 'cache'));
const BROWSER = argOf('browser', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const PROFILE = path.join(os.tmpdir(), 'qirtas-click-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE_PATH = new URL(BASE).pathname.replace(/\/$/, '');

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
    const c = new CDP(ws);
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && c.pending.has(m.id)) { c.pending.get(m.id)(m); c.pending.delete(m.id); } else if (m.method) c.events.push(m); };
    return c;
  }
  send(m, p = {}) { const id = ++this.id; return new Promise((r) => { this.pending.set(id, r); this.ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); r({ __timeout: true }); } }, 30000); }); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.text }; return r.result && r.result.result ? r.result.result.value : null; }
  async goto(u, w = 2800) { await this.send('Page.navigate', { url: u }); await sleep(w); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  let v = null; for (let i = 0; i < 40; i++) { try { v = await httpJSON('GET', `http://127.0.0.1:${PORT}/json/version`); if (v && v.webSocketDebuggerUrl) break; } catch (e) {} await sleep(400); }
  if (!v) { console.log(JSON.stringify({ error: 'browser did not start' })); try { proc.kill(); } catch (e) {} process.exit(2); }
  const t = await httpJSON('PUT', `http://127.0.0.1:${PORT}/json/new?about:blank`);
  const cdp = await CDP.attach(t.webSocketDebuggerUrl || t.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');

  const pages = ['/', '/library/', '/library/?page=3', '/authors/', '/stats/', '/about/', '/rights/', '/contact/', '/privacy/'];
  const links = new Map();
  const tapIssues = [];
  const weights = [];

  for (const p of pages) {
    await cdp.goto(BASE + p, 2600);
    const r = await cdp.eval(`(() => ({
      links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h && (h.startsWith('/') || h.startsWith('.'))).map((h) => h.split('#')[0]),
      small: [...document.querySelectorAll('a.btn, button, .book-card, .icon-btn, .author-chip')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.height < 32 || b.width < 32); }).length,
      controls: document.querySelectorAll('a.btn, button, .book-card, .icon-btn, .author-chip').length,
      bytes: (performance.getEntriesByType('resource') || []).reduce((s, e) => s + (e.transferSize || 0), 0) + (performance.getEntriesByType('navigation')[0] || {}).transferSize || 0,
      domMs: Math.round((performance.getEntriesByType('navigation')[0] || {}).domContentLoadedEventEnd || 0),
    }))()`);
    if (r && r.links) for (const h of r.links) links.set(h, p);
    if (r && r.small) tapIssues.push({ page: p, smallTargets: r.small, controls: r.controls });
    if (r) weights.push({ page: p, kb: Math.round((r.bytes || 0) / 1024), domMs: r.domMs });
  }

  // check every distinct internal target
  const targets = [...links.keys()].slice(0, LIMIT);
  const broken = [];
  const checked = [];
  for (const href of targets) {
    const url = BASE + (BASE_PATH && href.startsWith(BASE_PATH) ? href.slice(BASE_PATH.length) : href);
    const status = await cdp.eval(`fetch(${JSON.stringify(url)}, { method: 'GET' }).then((r) => r.status, (e) => 'ERR ' + e.message)`);
    checked.push({ href, status });
    if (status !== 200) broken.push({ href, status, onPage: links.get(href) });
  }

  const report = { base: BASE, when: new Date().toISOString(), pagesScanned: pages.length, linksFound: links.size, linksChecked: checked.length, broken, tapIssues, weights };
  fs.writeFileSync(path.join(OUT, 'click-audit.json'), JSON.stringify(report, null, 2));
  console.log('pages scanned : ' + report.pagesScanned);
  console.log('links found   : ' + report.linksFound + ' | checked: ' + report.linksChecked);
  console.log('broken links  : ' + broken.length);
  broken.slice(0, 12).forEach((b) => console.log('   - ' + b.status + '  ' + b.href + '   (seen on ' + b.onPage + ')'));
  console.log('tap-target issues (elements < 32px):');
  tapIssues.forEach((x) => console.log('   - ' + x.page + ' → ' + x.smallTargets + ' من ' + x.controls));
  console.log('page weight / DOM ready:');
  weights.forEach((w) => console.log('   - ' + w.page + ' → ' + w.kb + ' KB, DOM ' + w.domMs + ' ms'));
  try { proc.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('click audit failed: ' + e.message); process.exit(1); });
