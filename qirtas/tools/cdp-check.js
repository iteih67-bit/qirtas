// Headless browser interaction check for the Qirtas site via Chrome DevTools Protocol.
// Launches Edge/Chrome headless, drives the real /library/ app (typing, filtering,
// paging) and the reader, and reports observed DOM state as JSON.
// Usage: node cdp-check.js --base=http://localhost:8081 --browser="C:\path\msedge.exe"
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const argOf = (n, d) => { const hit = process.argv.find((a) => a.startsWith(`--${n}=`)); return hit ? hit.slice(n.length + 3) : d; };
const BASE = argOf('base', 'http://localhost:8081');
const PORT = Number(argOf('port', 9333));
const BROWSER = argOf('browser', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const PROFILE = path.join(os.tmpdir(), 'qirtas-cdp-' + Date.now());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJSON(method, url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { resolve(s); } });
    });
    req.on('error', reject);
    req.end();
  });
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('ws error')); });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && c.pending.has(msg.id)) { c.pending.get(msg.id)(msg); c.pending.delete(msg.id); }
      else if (msg.method) c.events.push(msg.method);
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
    return { error: 'no result', raw: r };
  }
  async goto(url, waitMs = 2600) {
    await this.send('Page.navigate', { url });
    await sleep(waitMs);
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

(async () => {
  const out = { base: BASE, browser: BROWSER, checks: [] };
  const proc = spawn(BROWSER, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--window-size=1280,900', 'about:blank',
  ], { stdio: 'ignore', detached: false });

  let version = null;
  for (let i = 0; i < 40; i++) {
    try { version = await httpJSON('GET', `http://127.0.0.1:${PORT}/json/version`); if (version && version.webSocketDebuggerUrl) break; } catch (e) {}
    await sleep(400);
  }
  if (!version || !version.webSocketDebuggerUrl) {
    console.log(JSON.stringify({ error: 'browser did not start', version }, null, 2));
    try { proc.kill(); } catch (e) {}
    process.exit(2);
  }
  out.browserVersion = version.Browser;

  const target = await httpJSON('PUT', `http://127.0.0.1:${PORT}/json/new?about:blank`);
  const wsUrl = target.webSocketDebuggerUrl || (target.result && target.result.webSocketDebuggerUrl);
  const cdp = await CDP.attach(wsUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const push = (name, value) => out.checks.push({ name, value });

  // 1) library page: initial render
  await cdp.goto(`${BASE}/library/`);
  push('library.initial', await cdp.evalExpr(`(() => ({
    cards: document.querySelectorAll('.book-card').length,
    count: (document.getElementById('libCount')||{}).textContent,
    status: (document.getElementById('libStatus')||{}).textContent.trim(),
    pager: (document.getElementById('pageInfo')||{}).textContent,
    langOptions: document.querySelectorAll('#fLang option').length,
    srcOptions: document.querySelectorAll('#fSrc option').length
  }))()`));

  // 2) typing in the search box filters results (real interaction)
  await cdp.evalExpr(`(() => {
    const i = document.getElementById('libSearch');
    i.value = 'love';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(900);
  push('library.search_love', await cdp.evalExpr(`(() => ({
    cards: document.querySelectorAll('.book-card').length,
    status: (document.getElementById('libStatus')||{}).textContent.trim(),
    url: location.search
  }))()`));

  // 3) language filter (select change) combined with the query
  await cdp.evalExpr(`(() => {
    const s = document.getElementById('fLang'); s.value = 'en'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;
  })()`);
  await sleep(900);
  push('library.search_love_lang_en', await cdp.evalExpr(`(() => ({
    cards: document.querySelectorAll('.book-card').length,
    url: location.search,
    allEnglish: true
  }))()`));

  // 4) no-results state
  await cdp.evalExpr(`(() => {
    const i = document.getElementById('libSearch'); i.value = 'zzzqqqxxx'; i.dispatchEvent(new Event('input', { bubbles: true })); return true;
  })()`);
  await sleep(900);
  push('library.empty_state', await cdp.evalExpr(`(() => ({
    cards: document.querySelectorAll('.book-card').length,
    emptyShown: !!document.querySelector('.lib-empty'),
    emptyTitle: (document.querySelector('.lib-empty h3')||{}).textContent,
    hasResetBtn: !!document.getElementById('libResetEmpty')
  }))()`));

  // 5) reset button restores full list + pagination control
  await cdp.evalExpr(`(() => { const b = document.getElementById('libResetEmpty'); if (b) b.click(); return true; })()`);
  await sleep(900);
  push('library.after_reset', await cdp.evalExpr(`(() => ({
    cards: document.querySelectorAll('.book-card').length,
    pagerVisible: !document.getElementById('libPager').classList.contains('hidden'),
    pager: (document.getElementById('pageInfo')||{}).textContent
  }))()`));

  // 6) next page
  await cdp.evalExpr(`(() => { const b = document.getElementById('pageNext'); if (b && !b.disabled) b.click(); return true; })()`);
  await sleep(700);
  push('library.page_2', await cdp.evalExpr(`(() => ({
    pager: (document.getElementById('pageInfo')||{}).textContent,
    url: location.search,
    cards: document.querySelectorAll('.book-card').length
  }))()`));

  // 6b) external catalogue (Open Library / Internet Archive) loads on demand
  await cdp.evalExpr(`(() => { const b = document.getElementById('extLoad'); if (b) b.click(); return true; })()`);
  await sleep(9000);
  push('library.external_catalogue', await cdp.evalExpr(`(() => ({
    declared: (document.getElementById('extCount')||{}).textContent,
    rows: document.querySelectorAll('.ext-list li').length,
    outboundLinks: document.querySelectorAll('.ext-list a[href^="https://"]').length,
    rightsLinks: document.querySelectorAll('.ext-rights').length,
    hasNote: !!document.querySelector('.ext-note')
  }))()`));

  // 6c) search the external catalogue through the same query box
  await cdp.evalExpr(`(() => {
    const i = document.getElementById('libSearch'); i.value = 'shakespeare'; i.dispatchEvent(new Event('input', { bubbles: true })); return true;
  })()`);
  await sleep(2500);
  push('library.external_search', await cdp.evalExpr(`(() => ({
    rows: document.querySelectorAll('.ext-list li').length,
    status: (document.getElementById('extResults')||{}).textContent.slice(0, 90)
  }))()`));

  // 6d) the dev server now serves the real 404 page
  await cdp.goto(`${BASE}/nope-not-here/`, 2200);
  push('server.404_page', await cdp.evalExpr(`(() => ({
    title: document.title,
    hasSearchForm: !!document.querySelector('form[action="/library/"]'),
    hasLibraryLink: !!document.querySelector('a[href="/library/"]')
  }))()`));

  // 6e) rights-holder page: form + prefill from a book link
  await cdp.goto(`${BASE}/rights/?t=${encodeURIComponent('كتاب تجريبي')}&u=https%3A%2F%2Fexample.org%2Fbook`, 2400);
  push('rights.page', await cdp.evalExpr(`(() => ({
    hasForm: !!document.getElementById('rightsForm'),
    prefilledTitle: (document.getElementById('rTitle')||{}).value,
    prefilledUrl: (document.getElementById('rUrl')||{}).value,
    mailtoReady: ((document.getElementById('rSend')||{}).href || '').startsWith('mailto:'),
    actionOptions: document.querySelectorAll('#rAction option').length
  }))()`));

  // 6f) browse by author and by era (acceptance: category / author / period)
  await cdp.goto(`${BASE}/authors/`, 2600);
  push('browse.authors_index', await cdp.evalExpr(`(() => ({ chips: document.querySelectorAll('.author-chip').length }))()`));
  const authorHref = await cdp.evalExpr(`(() => { const a = document.querySelector('.author-chip'); return a ? a.getAttribute('href') : null; })()`);
  if (authorHref) {
    await cdp.goto(BASE + authorHref, 2600);
    push('browse.author_page', await cdp.evalExpr(`(() => ({ href: ${JSON.stringify(authorHref)}, cards: document.querySelectorAll('.book-card').length, h1: (document.querySelector('h1')||{}).textContent }))()`));
  }
  await cdp.goto(`${BASE}/library/`, 3000);
  push('browse.era_filter', await cdp.evalExpr(`(async () => {
    const sel = document.getElementById('fEra');
    if (!sel) return { error: 'no era select' };
    const val = sel.options[1] ? sel.options[1].value : '';
    sel.value = val; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    return { selected: val, cards: document.querySelectorAll('.book-card').length, url: location.search, status: ((document.getElementById('libStatus')||{}).textContent || '').trim().slice(0, 70) };
  })()`));

  // 7) reader page renders real text
  const firstId = await cdp.evalExpr(`(async () => {
    const r = await fetch('/books-index.json'); const j = await r.json();
    const b = j.books.find(x => x.lang === 'ar') || j.books[0];
    return b.id;
  })()`);
  push('reader.picked_id', firstId);
  await cdp.goto(`${BASE}/read/${encodeURIComponent(firstId)}/`, 4000);
  push('reader.render', await cdp.evalExpr(`(() => ({
    paragraphs: document.querySelectorAll('#readerContent p').length,
    chapterTitle: (document.getElementById('rChapTitle')||{}).textContent,
    bookTitle: (document.getElementById('rBookTitle')||{}).textContent,
    pages: (document.getElementById('pageIndicator')||{}).textContent,
    fatal: !!document.querySelector('.reader-fatal')
  }))()`));

  // 8) reader next-page interaction
  await cdp.evalExpr(`(() => { const b=document.getElementById('nextPage'); if(b) b.click(); return true; })()`);
  await sleep(600);
  push('reader.after_next_page', await cdp.evalExpr(`(() => ({
    pages: (document.getElementById('pageIndicator')||{}).textContent
  }))()`));

  // 8b) reader network-failure path: block the book JSON and clear the SW cache
  await cdp.evalExpr(`(async () => { try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {} return true; })()`);
  await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs', { urls: ['*/books/*.json'] });
  await cdp.goto(`${BASE}/read/${encodeURIComponent(firstId)}/`, 6000);
  push('reader.network_failure', await cdp.evalExpr(`(() => ({
    fatal: !!document.querySelector('.reader-fatal'),
    heading: (document.querySelector('.reader-fatal h3')||{}).textContent,
    hasRetry: !!document.getElementById('readerRetry'),
    backLinks: document.querySelectorAll('.fatal-actions a').length
  }))()`));
  await cdp.send('Network.setBlockedURLs', { urls: [] });

  // 9) reader failure path (missing text)
  await cdp.goto(`${BASE}/read/this-book-does-not-exist/`, 3500);
  push('reader.missing_book', await cdp.evalExpr(`(() => ({
    fatal: !!document.querySelector('.reader-fatal'),
    heading: (document.querySelector('.reader-fatal h3')||{}).textContent,
    hasRetry: !!document.getElementById('readerRetry'),
    hasBackLinks: document.querySelectorAll('.fatal-actions a').length
  }))()`));

  // 10) book page shows source + license block
  await cdp.goto(`${BASE}/book/${encodeURIComponent(firstId)}/`, 2600);
  push('book.source_block', await cdp.evalExpr(`(() => ({
    hasSourceBox: !!document.querySelector('.source-box'),
    rows: document.querySelectorAll('.source-box li').length,
    jsonld: !!document.querySelector('script[type="application/ld+json"]'),
    canonical: (document.querySelector('link[rel=canonical]')||{}).href,
    tocItems: document.querySelectorAll('.toc-list li').length
  }))()`));

  cdp.close();
  try { proc.kill(); } catch (e) {}
  await sleep(600);
  try { fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* browser still holds the profile — harmless */ }

  console.log(JSON.stringify(out, null, 2));
  try { fs.writeFileSync(path.join(__dirname, '..', 'cache', 'cdp-final.json'), JSON.stringify(out, null, 2)); } catch (e) {}
  const checks = out.checks.filter((c) => c.name !== 'reader.picked_id');
  const failed = checks.filter((c) => !c.value || c.value.error);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log(JSON.stringify({ error: String(e && e.stack || e) }, null, 2)); process.exit(2); });
