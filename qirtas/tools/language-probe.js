// language-probe.js — verify the interface language switch in a real browser.
// node tools/language-probe.js --base=http://localhost:8081/qirtas [--port=9540]
'use strict';
const http = require('http');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BASE = argOf('base', 'http://localhost:8081/qirtas').replace(/\/$/, '');
const PORT = Number(argOf('port', 9540));
const BROWSER = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROFILE = path.join(os.tmpdir(), 'qirtas-lang-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function httpJSON(method, url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { resolve(s); } }); });
    req.on('error', reject); req.end();
  });
}
const STATE = `(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, nav: [...document.querySelectorAll('.site-nav a')].map((a) => a.textContent.trim()), toggle: (document.getElementById('langBtn')||{}).textContent, stored: (() => { try { return localStorage.getItem('q.ui.lang'); } catch (e) { return null; } })(), searchPh: (document.getElementById('libSearch')||{}).placeholder || null, status: (document.getElementById('libStatus')||{}).textContent || null }))()`;

(async () => {
  const proc = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  let v = null; for (let i = 0; i < 40; i++) { try { v = await httpJSON('GET', `http://127.0.0.1:${PORT}/json/version`); if (v && v.webSocketDebuggerUrl) break; } catch (e) {} await sleep(400); }
  const t = await httpJSON('PUT', `http://127.0.0.1:${PORT}/json/new?about:blank`);
  const ws = new WebSocket(t.webSocketDebuggerUrl || t.webSocketDebuggerUrl);
  await new Promise((res) => { ws.onopen = res; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalx = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : null; };
  await send('Page.enable'); await send('Runtime.enable');

  const rows = [];
  await send('Page.navigate', { url: BASE + '/' }); await sleep(2600);
  rows.push(['default (Arabic)', await evalx(STATE)]);

  await evalx("document.getElementById('langBtn').click()"); await sleep(700);
  rows.push(['after pressing EN', await evalx(STATE)]);

  await send('Page.navigate', { url: BASE + '/' }); await sleep(2200);
  rows.push(['after reload (persistence)', await evalx(STATE)]);

  await send('Page.navigate', { url: BASE + '/library/' }); await sleep(2800);
  rows.push(['library in English', await evalx(STATE)]);

  await evalx("document.getElementById('langBtn').click()"); await sleep(700);
  rows.push(['back to Arabic', await evalx(STATE)]);

  for (const [name, st] of rows) {
    console.log('=== ' + name);
    console.log('    dir=' + st.dir + ' lang=' + st.lang + ' toggle=' + JSON.stringify(st.toggle) + ' stored=' + JSON.stringify(st.stored));
    console.log('    nav=' + JSON.stringify(st.nav));
    if (st.searchPh) console.log('    search placeholder=' + JSON.stringify(st.searchPh));
    if (st.status) console.log('    library status=' + JSON.stringify(st.status.slice(0, 70)));
  }
  try { proc.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('language probe failed: ' + e.message); process.exit(1); });
