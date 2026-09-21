// Qirtas database layer — SQLite through the built-in node:sqlite module.
// No external service, no npm dependency: one file on disk (data/qirtas.db).
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..', '..');
const DB_DIR = path.join(ROOT, 'data');
const DB_FILE = process.env.QIRTAS_DB || path.join(DB_DIR, 'qirtas.db');
const SCHEMA = path.join(__dirname, 'schema.sql');

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/** Arabic-aware normalisation for search keys and duplicate detection. */
function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(TASHKEEL, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Rough era bucket for browsing (works for Arabic and English records). */
function eraOf(book) {
  const y = String(book.year || '');
  const m = y.match(/(\d{3,4})/);
  const n = m ? Number(m[1]) : null;
  const death = Number(book.deathYear || 0);
  if (n && n >= 1900) return 'القرن العشرون';
  if (n && n >= 1800) return 'القرن التاسع عشر';
  if (n) return 'كلاسيكيات ما قبل 1800';
  if (/القرن|هـ|هجري/i.test(y)) return 'تراث عربي';
  if (death && death >= 1900) return 'القرن العشرون';
  if (death && death >= 1800) return 'القرن التاسع عشر';
  if ((book.lang || book.language) === 'ar') return 'تراث عربي';
  return 'كلاسيكيات عالمية';
}

let db = null;
function open() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  return db;
}

const nowISO = () => new Date().toISOString();

function audit(actor, action, targetType, targetId, details) {
  open().prepare('INSERT INTO audit_log (actor, action, target_type, target_id, details, created_at) VALUES (?,?,?,?,?,?)')
    .run(actor, action, targetType || null, targetId ? String(targetId) : null,
      details ? String(details).slice(0, 2000) : null, nowISO());
}

const INSERT_SQL = `INSERT INTO books (
  id, slug, title, title_en, author, author_en, translator, publisher, year, era, category, language,
  source_key, source_label, source_url, license_type, license_label, license_url, license_audit,
  cover, emoji, file_path, file_format, file_bytes, words, chapters, description, description_en,
  gutenberg_id, death_year, search_key, hidden, removed, created_at, updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title, title_en=excluded.title_en, author=excluded.author, author_en=excluded.author_en,
  translator=excluded.translator, publisher=excluded.publisher, year=excluded.year, era=excluded.era,
  category=excluded.category, language=excluded.language, source_key=excluded.source_key,
  source_label=excluded.source_label, source_url=excluded.source_url, license_type=excluded.license_type,
  license_label=excluded.license_label, license_url=excluded.license_url, license_audit=excluded.license_audit,
  cover=excluded.cover, emoji=excluded.emoji, file_path=excluded.file_path, file_format=excluded.file_format,
  file_bytes=excluded.file_bytes, words=excluded.words, chapters=excluded.chapters,
  description=excluded.description, description_en=excluded.description_en,
  gutenberg_id=excluded.gutenberg_id, death_year=excluded.death_year,
  search_key=excluded.search_key, updated_at=excluded.updated_at`;

function upsertBook(b) {
  const d = open();
  const title = (b.title && (b.title.ar || b.title.en)) || b.id;
  const titleEn = (b.title && (b.title.en || b.title.ar)) || null;
  const author = (b.author && (b.author.ar || b.author.en)) || null;
  const authorEn = (b.author && (b.author.en || b.author.ar)) || null;
  d.prepare(INSERT_SQL).run(
    b.id, b.slug || b.id, title, titleEn, author, authorEn,
    b.translator || null, b.publisher || null, b.year ? String(b.year) : null, eraOf(b),
    b.cat || b.category || null, b.lang || b.language || 'ar',
    b.sourceKey || b.source || 'other',
    (b.sourceLabel && b.sourceLabel.ar) || (typeof b.sourceLabel === 'string' ? b.sourceLabel : null),
    b.sourceUrl || null,
    b.license || null,
    (b.licenseLabel && b.licenseLabel.ar) || (typeof b.licenseLabel === 'string' ? b.licenseLabel : null),
    b.licenseUrl || null, b.licenseAudit || null,
    b.grad || b.cover || null, b.emoji || null,
    b.filePath || null, b.fileFormat || null, b.fileBytes || null,
    b.words || 0, b.chapters || 0,
    (b.description && (b.description.ar || b.description.en)) || null,
    (b.description && b.description.en) || null,
    b.gutenbergId ? String(b.gutenbergId) : null,
    b.deathYear || null,
    normKey(`${title} ${titleEn} ${author} ${authorEn}`),
    b.hidden ? 1 : 0, b.removed ? 1 : 0,
    b.addedAt || nowISO().slice(0, 10), nowISO(),
  );
}

function listBooks({ includeHidden = false, limit = null } = {}) {
  const where = includeHidden ? '' : 'WHERE hidden = 0 AND removed = 0';
  return open().prepare(`SELECT * FROM books ${where} ORDER BY created_at DESC, title ASC ${limit ? 'LIMIT ' + Number(limit) : ''}`).all();
}

/** Arabic-tolerant search: diacritics, alef/hamza forms, ya/alef-maqsura, ta-marbuta. */
function searchBooks(q, { lang, cat, era, limit = 40 } = {}) {
  const key = normKey(q || '');
  const terms = key ? key.split(' ').filter(Boolean) : [];
  const where = ['hidden = 0', 'removed = 0'];
  const args = [];
  if (lang) { where.push('language = ?'); args.push(lang); }
  if (cat) { where.push('category = ?'); args.push(cat); }
  if (era) { where.push('era = ?'); args.push(era); }
  for (const t of terms) { where.push('search_key LIKE ?'); args.push('%' + t + '%'); }
  args.push(Number(limit));
  return open().prepare(`SELECT id, title, author, language, category, era, source_key, license_label, words, chapters
    FROM books WHERE ${where.join(' AND ')}
    ORDER BY (language = 'ar') DESC, words DESC LIMIT ?`).all(...args);
}

function createRequest(r) {
  const info = open().prepare(`INSERT INTO takedown_requests
    (book_id, book_title, requester, role, email, claim_type, official_url, message, status, ip, created_at)
    VALUES (?,?,?,?,?,?,?,?, 'pending', ?, ?)`)
    .run(r.book_id || null, r.book_title || null, r.requester, r.role || null, r.email || null,
      r.claim_type || null, r.official_url || null, (r.message || '').slice(0, 4000), r.ip || null, nowISO());
  audit('public', 'request.created', 'book', r.book_id || null, `${r.requester} — ${r.book_title || ''}`);
  return Number(info.lastInsertRowid);
}

function listRequests(status) {
  const d = open();
  return status
    ? d.prepare('SELECT * FROM takedown_requests WHERE status = ? ORDER BY created_at DESC').all(status)
    : d.prepare('SELECT * FROM takedown_requests ORDER BY created_at DESC').all();
}

function resolveRequest(id, status, note, reviewer) {
  open().prepare('UPDATE takedown_requests SET status = ?, decision_note = ?, reviewer = ?, reviewed_at = ? WHERE id = ?')
    .run(status, note || null, reviewer || 'admin', nowISO(), Number(id));
  audit(reviewer || 'admin', 'request.resolved', 'request', String(id), `${status}: ${note || ''}`);
}

function setBookFlags(id, { hidden, removed, reason } = {}) {
  const sets = [];
  const args = [];
  if (typeof hidden === 'boolean') { sets.push('hidden = ?'); args.push(hidden ? 1 : 0); }
  if (typeof removed === 'boolean') { sets.push('removed = ?'); args.push(removed ? 1 : 0); }
  if (reason !== undefined) { sets.push('removed_reason = ?'); args.push(reason || null); }
  sets.push('updated_at = ?'); args.push(nowISO());
  args.push(id);
  open().prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  audit('admin', removed === true ? 'book.removed' : hidden === true ? 'book.hidden' : 'book.updated', 'book', id, reason || '');
}

function startRun(sourceKey, notes, logPath) {
  const info = open().prepare('INSERT INTO import_runs (source_key, started_at, notes, log_path) VALUES (?,?,?,?)')
    .run(sourceKey, nowISO(), notes || null, logPath || null);
  return Number(info.lastInsertRowid);
}
function finishRun(id, { added = 0, skipped = 0, failed = 0, notes = '' } = {}) {
  open().prepare('UPDATE import_runs SET finished_at = ?, added = ?, skipped = ?, failed = ?, notes = COALESCE(?, notes) WHERE id = ?')
    .run(nowISO(), added, skipped, failed, notes || null, Number(id));
  audit('system', 'import.run', 'source', String(id), `added=${added} skipped=${skipped} failed=${failed}`);
}
function listRuns(limit = 50) {
  return open().prepare('SELECT * FROM import_runs ORDER BY started_at DESC LIMIT ?').all(Number(limit));
}
function listAudit(limit = 200) {
  return open().prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(Number(limit));
}
function stats() {
  const d = open();
  const one = (sql) => d.prepare(sql).get();
  return {
    total: one('SELECT COUNT(*) c FROM books').c,
    visible: one('SELECT COUNT(*) c FROM books WHERE hidden = 0 AND removed = 0').c,
    arabic: one("SELECT COUNT(*) c FROM books WHERE language = 'ar' AND hidden = 0 AND removed = 0").c,
    english: one("SELECT COUNT(*) c FROM books WHERE language = 'en' AND hidden = 0 AND removed = 0").c,
    hidden: one('SELECT COUNT(*) c FROM books WHERE hidden = 1').c,
    removed: one('SELECT COUNT(*) c FROM books WHERE removed = 1').c,
    words: one('SELECT COALESCE(SUM(words),0) c FROM books WHERE hidden = 0 AND removed = 0').c,
    pendingRequests: one("SELECT COUNT(*) c FROM takedown_requests WHERE status = 'pending'").c,
    bySource: d.prepare('SELECT source_key k, COUNT(*) c FROM books WHERE hidden=0 AND removed=0 GROUP BY source_key ORDER BY c DESC').all(),
    byEra: d.prepare('SELECT era k, COUNT(*) c FROM books WHERE hidden=0 AND removed=0 GROUP BY era ORDER BY c DESC').all(),
    byCategory: d.prepare('SELECT category k, COUNT(*) c FROM books WHERE hidden=0 AND removed=0 GROUP BY category ORDER BY c DESC').all(),
  };
}

module.exports = {
  DB_FILE, open, normKey, eraOf, audit, upsertBook, listBooks, searchBooks,
  createRequest, listRequests, resolveRequest, setBookFlags,
  startRun, finishRun, listRuns, listAudit, stats, nowISO,
};
