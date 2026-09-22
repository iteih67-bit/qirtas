// overflow-finder.js — pinpoint the element that makes the document wider than the viewport.
// usage: node tools/overflow-finder.js --base=<url> --width=360 [--paths=/]
'use strict';
const http = require('http');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BASE = argOf('base', 'http://localhost:8081/qirtas').replace(/\/$/, '');
const W = Number(argOf('width', 360));
const PATHS = argOf('paths', '/,/library/,/stats/,/authors/,/about/').split(',');
const PORT = Number(argOf('port', 9530));
const BROWSER = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROFILE = path.join(os.tmpdir(), 'qirtas-overflow-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function httpJSON(method, url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { resolve(s); } }); });
    req.on('error', reject); req.end();
  });
}
const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const desc = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').slice(0, 2).join('.') : '');
  const wide = [], dirty = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width > vw + 1) wide.push({ el: desc(el), w: Math.round(r.width), right: Math.round(r.right), left: Math.round(r.left) });
    const over = el.scrollWidth - el.clientWidth;
    if (over > 2 && el.clientWidth > 0) dirty.push({ el: desc(el), over, scrollW: el.scrollWidth, clientW: el.clientWidth, ws: getComputedStyle(el).whiteSpace });
  }
  wide.sort((a, b) => b.w - a.w);
  dirty.sort((a, b) => b.over - a.over);
  return { vw, docW: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth - vw, wide: wide.slice(0, 5), dirty: dirty.slice(0, 5) };
})()`;

(async () => {
  const proc = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
  let v = null; for (let i = 0; i < 40; i++) { try { v = await httpJSON('GET', `http://127.0.0.1:${PORT}/json/version`); if (v && v.webSocketDebuggerUrl) break; } catch (e) {} await sleep(400); }
  const t = await httpJSON('PUT', `http://127.0.0.1:${PORT}/json/new?about:blank`);
  const ws = new WebSocket(t.webSocketDebuggerUrl || t.webSocketDebuggerUrl);
  await new Promise((res) => { ws.onopen = res; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 800, deviceScaleFactor: 1, mobile: W < 800 });

  let bad = 0;
  for (const p of PATHS) {
    await send('Page.navigate', { url: BASE + p });
    await sleep(2800);
    const r = await send('Runtime.evaluate', { returnByValue: true, expression: PROBE });
    const val = r.result && r.result.result ? r.result.result.value : null;
    if (!val) continue;
    if (val.overflow > 1) bad++;
    console.log('=== ' + p + '  viewport ' + val.vw + '  doc ' + val.docW + '  overflow ' + val.overflow + 'px');
    console.log('    elements wider than the viewport:');
    for (const e of val.wide) console.log('       <' + e.el + '>  w=' + e.w + '  left=' + e.left + '  right=' + e.right);
    console.log('    elements overflowing their own box:');
    for (const e of val.dirty) console.log('       <' + e.el + '>  scrollW=' + e.scrollW + ' > clientW=' + e.clientW + '  ws=' + e.ws);
  }
  console.log('\npages with overflow at ' + W + 'px: ' + bad + '/' + PATHS.length);
  try { proc.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('finder failed: ' + e.message); process.exit(1); });
