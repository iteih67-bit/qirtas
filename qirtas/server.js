// Qirtas application server — static site + public takedown API + admin console.
// Zero npm dependencies: Node http + node:sqlite + node:crypto.
//
//   node server.js                 → http://localhost:8081
//   PORT=8090 node server.js
//   QIRTAS_DB=... ADMIN_PASSWORD=... node server.js
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const db = require('./pipeline/lib/db');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'site', 'dist');
const TEXTS = path.join(ROOT, 'books-data', 'texts');
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8081);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.epub': 'application/epub+zip',
};

/* ------------------------------------------------------------------ auth */
function adminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const f = path.join(DATA, 'admin-password.txt');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const generated = crypto.randomBytes(9).toString('base64url');
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(f, generated + '\n', { mode: 0o600 });
  console.log('\n[قِرطاس] تم توليد كلمة مرور لوحة التحكم وحفظها في:\n  ' + f + '\n  كلمة المرور: ' + generated + '\n(غيّرها بمتغير البيئة ADMIN_PASSWORD)\n');
  return generated;
}
const SECRET_FILE = path.join(DATA, '.session-secret');
function sessionSecret() {
  if (!fs.existsSync(SECRET_FILE)) {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return fs.readFileSync(SECRET_FILE, 'utf8');
}
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(pw, salt, 32).toString('hex');
  return `${salt}:${key}`;
}
function verifyPassword(pw) {
  const stored = hashPassword === null ? null : adminPassword();
  // Compare against the live password (constant-time).
  const a = Buffer.from(crypto.scryptSync(pw, 'qirtas-admin', 32));
  const b = Buffer.from(crypto.scryptSync(String(stored), 'qirtas-admin', 32));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function sign(value) {
  return value + '.' + crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex').slice(0, 32);
}
function unsign(signed) {
  if (!signed || typeof signed !== 'string') return null;
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const value = signed.slice(0, i);
  return sign(value) === signed ? value : null;
}
function parseCookies(req) {
  const out = {};
  const header = (req && req.headers && req.headers.cookie) || '';
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function isAdmin(req) {
  const c = parseCookies(req);
  const v = unsign(c.qirtas_session);
  if (!v) return false;
  const [ts, who] = v.split('|');
  return who === 'admin' && Date.now() - Number(ts) < 12 * 3600 * 1000;
}

/* -------------------------------------------------------------- helpers */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function readBody(req, limit = 200000) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > limit) { req.destroy(); reject(new Error('payload too large')); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function parseForm(text) {
  const out = {};
  for (const [k, v] of new URLSearchParams(text)) out[k] = v;
  return out;
}
function send(res, status, body, headers = {}) {
  const h = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers };
  res.writeHead(status, h);
  res.end(body);
}
function sendJSON(res, status, obj) {
  send(res, status, JSON.stringify(obj, null, 2), { 'Content-Type': 'application/json; charset=utf-8' });
}

/* ------------------------------------------------------------ admin views */
const ADMIN_CSS = `:root{--ink:#17191c;--soft:#5b6570;--line:#e4e6e9;--bg:#fbfbfa;--accent:#0b5fff;--ok:#0b7a4b;--warn:#b26a00;--bad:#b3261e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 system-ui,'Segoe UI','Noto Naskh Arabic',Tahoma,sans-serif}
header{background:#fff;border-bottom:1px solid var(--line);padding:14px 22px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
header b{font-size:1.05rem}header a{color:var(--soft);text-decoration:none;font-size:.9rem}header a:hover{color:var(--accent)}
main{max-width:1080px;margin:26px auto;padding:0 20px}
h1{font-size:1.35rem;margin:0 0 6px}h2{font-size:1.05rem;margin:26px 0 10px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:.88rem}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:start;vertical-align:top}th{background:#f6f7f8;color:var(--soft);font-size:.78rem}
tr:last-child td{border-bottom:0}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.card b{display:block;font-size:1.5rem;font-variant-numeric:tabular-nums}.card span{color:var(--soft);font-size:.8rem}
.btn{display:inline-block;padding:7px 13px;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--ink);font:inherit;font-size:.83rem;cursor:pointer;text-decoration:none}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.btn.p{background:var(--accent);color:#fff;border-color:var(--accent)}
.btn.d{border-color:#e7b6b2;color:var(--bad)}
input,select,textarea{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;width:100%}
form.inline{display:inline}
.pill{padding:2px 9px;border-radius:999px;font-size:.72rem;font-weight:700}
.pending{background:#fff4e5;color:var(--warn)}.removed{background:#fdecea;color:var(--bad)}.kept{background:#e9f6ef;color:var(--ok)}.reviewing{background:#eef3ff;color:var(--accent)}
.muted{color:var(--soft);font-size:.85rem}code{background:#f2f3f4;padding:1px 5px;border-radius:4px;font-size:.82rem}
.login{max-width:360px;margin:12vh auto;background:#fff;border:1px solid var(--line);border-radius:12px;padding:26px}
label{display:block;margin:12px 0 4px;font-size:.82rem;color:var(--soft)}
`;

function adminShell(title, body, req) {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — إدارة قِرطاس</title>
<style>${ADMIN_CSS}</style></head><body>
<header><b>قِرطاس · لوحة التحكم</b>
<a href="/admin/">الرئيسية</a><a href="/admin/books">الكتب</a><a href="/admin/requests">طلبات الإزالة</a>
<a href="/admin/runs">عمليات الجذب</a><a href="/admin/audit">سجل التدقيق</a>
<span style="flex:1"></span><a href="/" target="_blank">الموقع ↗</a>
${isAdmin(req) ? '<a href="/admin/logout">خروج</a>' : ''}</header><main>${body}</main></body></html>`;
}

function loginPage(error) {
  return adminShell('دخول', `<div class="login">
<h1>دخول لوحة التحكم</h1>
${error ? `<p style="color:#b3261e">${esc(error)}</p>` : ''}
<form method="post" action="/admin/login">
<label>كلمة المرور</label><input type="password" name="password" autofocus required>
<p><button class="btn p" type="submit" style="margin-top:16px">دخول</button></p>
</form>
<p class="muted">كلمة المرور تُولَّد عند أول تشغيل في <code>data/admin-password.txt</code> ويمكن ضبطها بمتغير البيئة <code>ADMIN_PASSWORD</code>. هذا القسم غير مرتبط بالموقع العام.</p>
</div>`, {});
}

function dashboard(req) {
  const s = db.stats();
  const runs = db.listRuns(5);
  const audit = db.listAudit(8);
  const body = `
<h1>نظرة عامة</h1>
<p class="muted">حالة قاعدة البيانات والمحتوى. هذه الصفحة محمية ولا تظهر في الموقع العام.</p>
<div class="cards">
  <div class="card"><b>${s.visible}</b><span>كتاب ظاهر</span></div>
  <div class="card"><b>${s.arabic}</b><span>كتاب عربي</span></div>
  <div class="card"><b>${s.english}</b><span>كتاب إنجليزي</span></div>
  <div class="card"><b>${s.pendingRequests}</b><span>طلب إزالة معلّق</span></div>
  <div class="card"><b>${s.hidden}</b><span>مخفي</span></div>
  <div class="card"><b>${s.removed}</b><span>مُزال</span></div>
  <div class="card"><b>${(s.words / 1e6).toFixed(1)}M</b><span>كلمة</span></div>
</div>
<h2>التوزيع حسب المصدر</h2>
<table><thead><tr><th>المصدر</th><th>عدد</th></tr></thead><tbody>
${s.bySource.map((r) => `<tr><td>${esc(r.k)}</td><td>${r.c}</td></tr>`).join('')}</tbody></table>
<h2>التوزيع حسب الحقبة</h2>
<table><thead><tr><th>الحقبة</th><th>عدد</th></tr></thead><tbody>
${s.byEra.map((r) => `<tr><td>${esc(r.k)}</td><td>${r.c}</td></tr>`).join('')}</tbody></table>
<h2>آخر عمليات الجذب</h2>
<table><thead><tr><th>المصدر</th><th>البداية</th><th>أُضيف</th><th>تُخطّي</th><th>فشل</th><th>ملاحظة</th></tr></thead><tbody>
${runs.map((r) => `<tr><td>${esc(r.source_key)}</td><td>${esc(r.started_at)}</td><td>${r.added}</td><td>${r.skipped}</td><td>${r.failed}</td><td class="muted">${esc(r.notes || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">لا سجلات بعد</td></tr>'}
</tbody></table>
<h2>آخر الإجراءات (سجل التدقيق)</h2>
<table><thead><tr><th>الوقت</th><th>الفاعل</th><th>الإجراء</th><th>الهدف</th><th>تفاصيل</th></tr></thead><tbody>
${audit.map((a) => `<tr><td class="muted">${esc(a.created_at)}</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td>${esc(a.target_id || '')}</td><td class="muted">${esc((a.details || '').slice(0, 80))}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">لا إجراءات بعد</td></tr>'}
</tbody></table>`;
  return adminShell('نظرة عامة', body, req);
}

function booksPage(req, url) {
  const q = url.searchParams.get('q') || '';
  const lang = url.searchParams.get('lang') || '';
  const rows = q || lang
    ? db.searchBooks(q, { lang, limit: 100 })
    : db.listBooks({ includeHidden: true, limit: 100 });
  const ids = rows.map((r) => r.id);
  const flags = new Map();
  if (ids.length) {
    for (const r of db.open().prepare(`SELECT id, hidden, removed FROM books WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)) {
      flags.set(r.id, r);
    }
  }
  const body = `
<h1>الكتب (${rows.length} من أصل ${db.stats().total})</h1>
<form method="get" action="/admin/books" style="display:flex;gap:10px;max-width:620px;margin-bottom:16px">
  <input name="q" value="${esc(q)}" placeholder="ابحث بالعنوان أو المؤلف (يتسامح مع التشكيل والهمزات)">
  <select name="lang" style="max-width:130px"><option value="">كل اللغات</option>
    <option value="ar" ${lang === 'ar' ? 'selected' : ''}>عربي</option>
    <option value="en" ${lang === 'en' ? 'selected' : ''}>إنجليزي</option></select>
  <button class="btn p" type="submit">بحث</button>
</form>
<table><thead><tr><th>العنوان</th><th>المؤلف</th><th>اللغة</th><th>الحقبة</th><th>المصدر</th><th>الترخيص</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>
${rows.map((b) => {
    const f = flags.get(b.id) || { hidden: b.hidden || 0, removed: b.removed || 0 };
    const state = f.removed ? '<span class="pill removed">مُزال</span>' : f.hidden ? '<span class="pill pending">مخفي</span>' : '<span class="pill kept">ظاهر</span>';
    return `<tr>
    <td><a href="/book/${encodeURIComponent(b.id)}/" target="_blank">${esc(b.title)}</a><div class="muted">${esc(b.id)}</div></td>
    <td>${esc(b.author || '—')}</td><td>${b.language === 'ar' ? 'عربي' : 'إنجليزي'}</td>
    <td>${esc(b.era || '')}</td><td>${esc(b.source_key)}</td><td class="muted">${esc(b.license_label || '')}</td><td>${state}</td>
    <td>
      <form class="inline" method="post" action="/admin/book/${encodeURIComponent(b.id)}/hide"><input type="hidden" name="value" value="${f.hidden ? '0' : '1'}"><button class="btn" type="submit">${f.hidden ? 'إظهار' : 'إخفاء'}</button></form>
      <form class="inline" method="post" action="/admin/book/${encodeURIComponent(b.id)}/remove"><input type="hidden" name="value" value="${f.removed ? '0' : '1'}"><button class="btn d" type="submit">${f.removed ? 'استرجاع' : 'إزالة'}</button></form>
    </td></tr>`;
  }).join('') || '<tr><td colspan="8" class="muted">لا نتائج</td></tr>'}
</tbody></table>
<p class="muted">«إخفاء» = يختفي من الموقع ويبقى في القاعدة، «إزالة» = يُستبعد من البناء والبحث مع تسجيل السبب في سجل التدقيق.</p>`;
  return adminShell('الكتب', body, req);
}

function requestsPage(req, url) {
  const status = url.searchParams.get('status') || '';
  const rows = db.listRequests(status);
  const body = `
<h1>طلبات الإزالة (${rows.length})</h1>
<p class="muted">كل طلب من النموذج العام يظهر هنا بحالة <b>pending</b>، ويُغلق بقرار مسجَّل (مقبول/مرفوض).</p>
<div style="margin-bottom:14px">
  <a class="btn" href="/admin/requests">الكل</a>
  <a class="btn" href="/admin/requests?status=pending">معلّق</a>
  <a class="btn" href="/admin/requests?status=reviewing">قيد المراجعة</a>
  <a class="btn" href="/admin/requests?status=removed">مُزال</a>
  <a class="btn" href="/admin/requests?status=kept">مُبقى</a>
</div>
<table><thead><tr><th>#</th><th>الكتاب</th><th>مقدّم الطلب</th><th>الصفة</th><th>المطلوب</th><th>الرابط الرسمي</th><th>الحالة</th><th>الوقت</th><th>قرار</th></tr></thead><tbody>
${rows.map((r) => `<tr>
  <td>${r.id}</td>
  <td>${esc(r.book_title || '—')}<div class="muted">${esc(r.book_id || '')}</div></td>
  <td>${esc(r.requester)}<div class="muted">${esc(r.email || '')}</div></td>
  <td>${esc(r.role || '')}</td>
  <td class="muted">${esc(r.claim_type || '')}</td>
  <td class="muted">${r.official_url ? `<a href="${esc(r.official_url)}" target="_blank" rel="noopener">رابط ↗</a>` : '—'}</td>
  <td><span class="pill ${esc(r.status)}">${esc(r.status)}</span></td>
  <td class="muted">${esc(r.created_at)}</td>
  <td>
    <form method="post" action="/admin/request/${r.id}/resolve" style="display:flex;gap:6px;flex-direction:column;min-width:220px">
      <select name="status"><option value="reviewing">قيد المراجعة</option><option value="removed">إزالة الكتاب وتحويل الرابط</option><option value="kept">الإبقاء مع تصحيح البيانات</option></select>
      <input name="note" placeholder="ملاحظة القرار">
      <button class="btn p" type="submit">حفظ القرار</button>
    </form>
    ${r.decision_note ? `<div class="muted">${esc(r.decision_note)}</div>` : ''}
  </td></tr>`).join('') || '<tr><td colspan="9" class="muted">لا طلبات</td></tr>'}
</tbody></table>`;
  return adminShell('طلبات الإزالة', body, req);
}

function runsPage(req) {
  const rows = db.listRuns(60);
  const body = `
<h1>عمليات الجذب (${rows.length})</h1>
<p class="muted">كل تشغيل لمصدر يُسجَّل هنا: الوقت، عدد ما أُضيف، ما تُخطّي، ما فشل.</p>
<table><thead><tr><th>#</th><th>المصدر</th><th>البداية</th><th>النهاية</th><th>أُضيف</th><th>تُخطّي</th><th>فشل</th><th>ملاحظة</th><th>سجل</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${r.id}</td><td>${esc(r.source_key)}</td><td class="muted">${esc(r.started_at)}</td><td class="muted">${esc(r.finished_at || '—')}</td>
<td>${r.added}</td><td>${r.skipped}</td><td>${r.failed}</td><td class="muted">${esc(r.notes || '')}</td><td class="muted">${esc(r.log_path || '')}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">لا سجلات</td></tr>'}
</tbody></table>`;
  return adminShell('عمليات الجذب', body, req);
}

function auditPage(req) {
  const rows = db.listAudit(200);
  const body = `
<h1>سجل التدقيق (${rows.length})</h1>
<p class="muted">كل إجراء إداري أو عام مسجَّل بالوقت والفاعل.</p>
<table><thead><tr><th>#</th><th>الوقت</th><th>الفاعل</th><th>الإجراء</th><th>النوع</th><th>الهدف</th><th>تفاصيل</th></tr></thead><tbody>
${rows.map((a) => `<tr><td>${a.id}</td><td class="muted">${esc(a.created_at)}</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td>${esc(a.target_type || '')}</td><td>${esc(a.target_id || '')}</td><td class="muted">${esc((a.details || '').slice(0, 120))}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">فارغ</td></tr>'}
</tbody></table>`;
  return adminShell('سجل التدقيق', body, req);
}

/* ------------------------------------------------------------- EPUB 3 */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipStore(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, cdBuf, end]);
}
function buildEpub(book, text) {
  const rtl = (book.language || 'ar') === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const esc2 = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const chapters = (text.chapters || []).map((c, i) =>
    `<item id="c${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ');
  const spine = (text.chapters || []).map((c, i) => `<itemref idref="c${i}"/>`).join('\n    ');
  const files = [
    { name: 'mimetype', data: 'application/epub+zip' },
    { name: 'META-INF/container.xml', data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>` },
    { name: 'OEBPS/content.opf', data: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${rtl ? 'ar' : 'en'}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">qirtas:${esc2(book.id)}</dc:identifier>
    <dc:title>${esc2(book.title)}</dc:title>
    <dc:creator>${esc2(book.author || '')}</dc:creator>
    <dc:language>${rtl ? 'ar' : 'en'}</dc:language>
    <dc:source>${esc2(book.source_url || '')}</dc:source>
    <dc:rights>${esc2(book.license_label || 'ملكية عامة')}</dc:rights>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${chapters}
  </manifest>
  <spine page-progression-direction="${rtl ? 'rtl' : 'ltr'}">
    <itemref idref="nav"/>
    ${spine}
  </spine>
</package>` },
    { name: 'OEBPS/style.css', data: `html,body{margin:0;padding:0}body{font-family:"Noto Naskh Arabic",serif;line-height:2;direction:${dir};padding:1.2em}
h1,h2{font-weight:700;line-height:1.5}p{margin:0 0 1em;text-align:justify}` },
    { name: 'OEBPS/nav.xhtml', data: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${rtl ? 'ar' : 'en'}" dir="${dir}">
<head><title>الفهرس</title></head><body><nav epub:type="toc"><h1>الفهرس</h1><ol>
${(text.chapters || []).map((c, i) => `<li><a href="ch${i}.xhtml">${esc2((c.title && (c.title.ar || c.title.en)) || '')}</a></li>`).join('')}
</ol></nav></body></html>` },
  ];
  (text.chapters || []).forEach((c, i) => {
    files.push({
      name: `OEBPS/ch${i}.xhtml`,
      data: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="${rtl ? 'ar' : 'en'}" dir="${dir}">
<head><title>${esc2((c.title && (c.title.ar || c.title.en)) || '')}</title><link rel="stylesheet" href="style.css"/></head>
<body><h2>${esc2((c.title && (c.title.ar || c.title.en)) || '')}</h2>
${(c.paragraphs || []).map((p) => `<p>${esc2(p)}</p>`).join('\n')}
</body></html>`,
    });
  });
  return zipStore(files);
}

/* --------------------------------------------------------------- routes */
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  // the published site lives under /qirtas/ â€” accept the same paths locally
  const rawPath = decodeURIComponent(url.pathname).replace(/^\/qirtas(?=\/|$)/, '') || '/';
  const p = rawPath;
  const servedBase = decodeURIComponent(url.pathname).startsWith('/qirtas') ? '/qirtas' : '';

  /* ---- public API ---- */
  if (p === '/api/stats' && req.method === 'GET') {
    const s = db.stats();
    return sendJSON(res, 200, {
      books: s.visible, arabic: s.arabic, english: s.english, words: s.words,
      byEra: s.byEra, bySource: s.bySource, generatedAt: new Date().toISOString(),
    });
  }
  if (p === '/api/search' && req.method === 'GET') {
    const rows = db.searchBooks(url.searchParams.get('q') || '', {
      lang: url.searchParams.get('lang') || undefined,
      cat: url.searchParams.get('cat') || undefined,
      era: url.searchParams.get('era') || undefined,
      limit: Number(url.searchParams.get('limit') || 40),
    });
    return sendJSON(res, 200, { query: url.searchParams.get('q') || '', normalized: db.normKey(url.searchParams.get('q') || ''), count: rows.length, results: rows });
  }
  if (p === '/api/books' && req.method === 'GET') {
    const cat = url.searchParams.get('cat') || undefined;
    const era = url.searchParams.get('era') || undefined;
    const lang = url.searchParams.get('lang') || undefined;
    const all = db.listBooks({});
    const rows = all.filter((b) => (!cat || b.category === cat) && (!era || b.era === era) && (!lang || b.language === lang))
      .map((b) => ({ id: b.id, title: b.title, author: b.author, language: b.language, era: b.era, category: b.category, words: b.words, chapters: b.chapters, source: b.source_key, license: b.license_label }));
    return sendJSON(res, 200, { count: rows.length, results: rows });
  }

  /* ---- public takedown submission ---- */
  if (p === '/api/takedown' && req.method === 'POST') {
    let fields = {};
    try {
      const raw = await readBody(req);
      fields = req.headers['content-type'] && req.headers['content-type'].includes('application/json')
        ? JSON.parse(raw) : parseForm(raw);
    } catch (e) {
      return sendJSON(res, 400, { ok: false, error: 'bad request body' });
    }
    if (!fields.requester || !(fields.book_title || fields.book_id)) {
      return sendJSON(res, 400, { ok: false, error: 'الاسم وعنوان الكتاب مطلوبان' });
    }
    const id = db.createRequest({
      book_id: fields.book_id, book_title: fields.book_title,
      requester: fields.requester, role: fields.role, email: fields.email,
      claim_type: fields.claim_type, official_url: fields.official_url,
      message: fields.message,
      ip: (req.socket.remoteAddress || '').replace(/^::ffff:/, ''),
    });
    return sendJSON(res, 201, { ok: true, requestId: id, status: 'pending', message: 'تم تسجيل الطلب وسيُراجع خلال أيام عمل قليلة' });
  }

  /* ---- EPUB download ---- */
  let m = p.match(/^\/api\/book\/([^/]+)\.epub$/);
  if (m && req.method === 'GET') {
    const id = m[1];
    const textFile = path.join(TEXTS, id + '.json');
    if (!fs.existsSync(textFile)) return sendJSON(res, 404, { ok: false, error: 'text not found' });
    const book = db.open().prepare('SELECT * FROM books WHERE id = ?').get(id);
    if (!book) return sendJSON(res, 404, { ok: false, error: 'book not found' });
    if (book.removed === 1) return sendJSON(res, 410, { ok: false, error: 'this book was removed' });
    const buf = buildEpub(book, JSON.parse(fs.readFileSync(textFile, 'utf8')));
    res.writeHead(200, {
      'Content-Type': 'application/epub+zip',
      'Content-Disposition': `attachment; filename="${id}.epub"`,
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=3600',
    });
    return res.end(buf);
  }

  /* ---- admin ---- */
  if (p === '/admin/login' && req.method === 'POST') {
    const body = parseForm(await readBody(req));
    if (verifyPassword(body.password || '')) {
      const value = `${Date.now()}|admin`;
      const cookie = `qirtas_session=${encodeURIComponent(sign(value))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`;
      db.audit('admin', 'auth.login', 'session', null, 'تسجيل دخول ناجح');
      return send(res, 302, '', { 'Set-Cookie': cookie, Location: '/admin/' });
    }
    db.audit('public', 'auth.failed', 'session', null, 'محاولة دخول فاشلة');
    return send(res, 401, loginPage('كلمة المرور غير صحيحة'));
  }
  if (p === '/admin/logout') {
    return send(res, 302, '', { 'Set-Cookie': 'qirtas_session=; Path=/; Max-Age=0', Location: '/admin/' });
  }
  if (p.startsWith('/admin')) {
    if (!isAdmin(req)) {
      if (req.method === 'GET') return send(res, 200, loginPage());
      return send(res, 401, loginPage('انتهت الجلسة أو غير مصرّح'));
    }
    if (req.method === 'GET') {
      if (p === '/admin/' || p === '/admin') return send(res, 200, dashboard(req));
      if (p === '/admin/books') return send(res, 200, booksPage(req, url));
      if (p === '/admin/requests') return send(res, 200, requestsPage(req, url));
      if (p === '/admin/runs') return send(res, 200, runsPage(req));
      if (p === '/admin/audit') return send(res, 200, auditPage(req));
      return send(res, 404, adminShell('غير موجود', '<h1>404</h1><p><a href="/admin/">عودة</a></p>', req));
    }
    if (req.method === 'POST') {
      let bm = p.match(/^\/admin\/book\/(.+)\/(hide|remove)$/);
      if (bm) {
        const id = bm[1];
        const body = parseForm(await readBody(req));
        const on = body.value === '1';
        const reason = on ? (bm[2] === 'remove' ? 'إزالة إدارية (طلب صاحب حق أو مراجعة)' : 'إخفاء مؤقت للمراجعة') : 'إرجاع بعد المراجعة';
        db.setBookFlags(id, bm[2] === 'hide' ? { hidden: on, reason } : { removed: on, reason });
        return send(res, 302, '', { Location: '/admin/books' });
      }
      bm = p.match(/^\/admin\/request\/(\d+)\/resolve$/);
      if (bm) {
        const body = parseForm(await readBody(req));
        const status = ['pending', 'reviewing', 'removed', 'kept'].includes(body.status) ? body.status : 'reviewing';
        db.resolveRequest(Number(bm[1]), status, body.note || '', 'admin');
        const reqRow = db.listRequests().find((r) => r.id === Number(bm[1]));
        if (reqRow && reqRow.book_id && status === 'removed') {
          db.setBookFlags(reqRow.book_id, { removed: true, reason: 'قرار على طلب إزالة رقم ' + reqRow.id });
        }
        return send(res, 302, '', { Location: '/admin/requests' });
      }
      return send(res, 404, adminShell('غير موجود', '<h1>404</h1>', req));
    }
  }

  /* ---- static site ---- */
  let filePath = p.endsWith('/') ? path.join(DIST, p, 'index.html') : path.join(DIST, p);
  if (!filePath.startsWith(DIST)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      const nf = path.join(DIST, '404.html');
      return fs.readFile(nf, (e2, d2) => {
        if (e2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(d2);
      });
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.json') headers['Cache-Control'] = 'public, max-age=300';
    if (ext === '.ttf' || ext === '.woff2') headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    res.writeHead(200, headers);
    res.end(data);
  });
}

if (require.main === module) {
  db.open();
  http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error('[خطأ]', e && e.stack || e);
      try { sendJSON(res, 500, { ok: false, error: 'internal error' }); } catch (_) {}
    });
  }).listen(PORT, () => {
    const s = db.stats();
    console.log(`قِرطاس → http://localhost:${PORT}`);
    console.log(`  قاعدة البيانات: ${db.DB_FILE}`);
    console.log(`  كتب ظاهرة: ${s.visible} (عربي ${s.arabic} / إنجليزي ${s.english})`);
    console.log(`  لوحة التحكم: http://localhost:${PORT}/admin/`);
  });
}

module.exports = { buildEpub, handle };
