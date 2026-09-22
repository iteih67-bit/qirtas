// capture.js — save full-page screenshots for design review (before/after).
//   node tools/capture.js --base=<url> --out=<dir> --prefix=before [--book=<id>]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BASE = argOf('base', 'http://localhost:8081/qirtas').replace(/\/$/, '');
const OUT = argOf('out', path.join(__dirname, '..', 'cache', 'shots'));
const PREFIX = argOf('prefix', 'shot');
const PORT = Number(argOf('port', 9480));
const BROWSER = argOf('browser', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const PROFILE = path.join(os.tmpdir(), 'qirtas-shots-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJSON(method, url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { resolve(s); } }); });
    req.on('error', reject); req.end();
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site', 'dist', 'catalog.json'), 'utf8'));
  const arBook = (catalog.find((b) => b.lang === 'ar' && (b.chapters || 0) > 8) || catalog[0]).id;

  const proc = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
  let v = null; for (let i = 0; i < 40; i++) { try { v = await httpJSON('GET', `http://127.0.0.1:${PORT}/json/version`); if (v && v.webSocketDebuggerUrl) break; } catch (e) {} await sleep(400); }
  if (!v) { console.log('browser did not start'); try { proc.kill(); } catch (e) {} process.exit(2); }
  const t = await httpJSON('PUT', `http://127.0.0.1:${PORT}/json/new?about:blank`);
  const ws = new WebSocket(t.webSocketDebuggerUrl || t.webSocketDebuggerUrl);
  await new Promise((res) => { ws.onopen = res; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');

  const pages = [
    { name: 'home', url: '/' },
    { name: 'library', url: '/library/' },
    { name: 'book', url: `/book/${arBook}/` },
    { name: 'reader', url: `/read/${arBook}/` },
    { name: 'authors', url: '/authors/' },
    { name: 'stats', url: '/stats/' },
  ];
  const widths = [{ w: 390, h: 844, tag: 'phone' }, { w: 1280, h: 900, tag: 'desktop' }];
  const saved = [];
  for (const w of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width: w.w, height: w.h, deviceScaleFactor: 1, mobile: w.w < 800 });
    for (const p of pages) {
      await send('Page.navigate', { url: BASE + p.url });
      await sleep(p.name === 'reader' ? 4200 : 2600);
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      if (shot.result && shot.result.data) {
        const file = path.join(OUT, `${PREFIX}-${p.name}-${w.tag}.png`);
        fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
        saved.push(file);
      }
    }
  }
  console.log('screenshots saved: ' + saved.length + ' → ' + OUT);
  saved.forEach((f) => console.log('  ' + path.basename(f)));
  try { proc.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('capture failed: ' + e.message); process.exit(1); });
