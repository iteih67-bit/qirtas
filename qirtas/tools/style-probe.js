// style-probe.js — measured design values (for the before/after design review).
// Usage: node tools/style-probe.js --base=http://localhost:8081/qirtas [--port=9490]
'use strict';
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BASE = argOf('base', 'http://localhost:8081/qirtas').replace(/\/$/, '');
const PORT = Number(argOf('port', 9490));
const OUT = argOf('out', path.join(__dirname, '..', 'cache'));
const BROWSER = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROFILE = path.join(os.tmpdir(), 'qirtas-style-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function httpJSON(method, url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { resolve(s); } }); });
    req.on('error', reject); req.end();
  });
}
(async () => {
  const proc = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let v = null; for (let i = 0; i < 40; i++) { try { v = await httpJSON('GET', `http://127.0.0.1:${PORT}/json/version`); if (v && v.webSocketDebuggerUrl) break; } catch (e) {} await sleep(400); }
  if (!v) { console.log('browser did not start'); process.exit(2); }
  const t = await httpJSON('PUT', `http://127.0.0.1:${PORT}/json/new?about:blank`);
  const ws = new WebSocket(t.webSocketDebuggerUrl || t.webSocketDebuggerUrl);
  await new Promise((res) => { ws.onopen = res; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(3000);
  const r = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const cs = (sel, prop) => { const el = document.querySelector(sel); if (!el) return null; const v = getComputedStyle(el); return prop ? v[prop] : { font: v.fontSize + '/' + v.lineHeight, color: v.color, bg: v.backgroundColor, pad: v.padding, radius: v.borderRadius, shadow: v.boxShadow.slice(0, 40) }; };
      const root = getComputedStyle(document.documentElement);
      return {
        vars: { accent: root.getPropertyValue('--accent').trim(), bg: root.getPropertyValue('--bg').trim(), surface: root.getPropertyValue('--surface').trim(), ink: root.getPropertyValue('--ink').trim(), line: root.getPropertyValue('--line').trim() },
        body: cs('body'),
        container: cs('.container'),
        hero: cs('.hero'),
        h1: cs('h1'),
        sectionTitle: cs('.section-title'),
        grid: cs('.book-grid', 'gap'),
        card: cs('.book-card'),
        btn: cs('.btn'),
        footer: cs('.site-footer'),
      };
    })()`,
  });
  const data = r.result && r.result.result ? r.result.result.value : r;
  fs.writeFileSync(path.join(OUT, 'style-probe.json'), JSON.stringify(data, null, 2));
  console.log(JSON.stringify(data, null, 1));
  try { proc.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('probe failed: ' + e.message); process.exit(1); });
