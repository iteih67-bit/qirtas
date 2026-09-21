// Shared pipeline helpers: catalog IO, slugs, text cleaning.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'books-data');
const TEXTS = path.join(DATA, 'texts');
const CATALOG = path.join(DATA, 'catalog.json');
const CACHE = path.join(ROOT, 'cache');

const COVERS = ['cover-g1', 'cover-g2', 'cover-g3', 'cover-g4', 'cover-g5'];
const EMOJIS = ['📚', '🌙', '🦁', '🌹', '🐇', '⚓', '🕌', '🕯️', '⚔️', '🐘', '🕊️', '⛵'];

function readCatalog() {
  if (!fs.existsSync(CATALOG)) return [];
  return JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
}
function writeCatalog(list) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(CATALOG, JSON.stringify(list, null, 2));
  return list;
}
function saveText(book) {
  fs.mkdirSync(TEXTS, { recursive: true });
  fs.writeFileSync(path.join(TEXTS, book.id + '.json'), JSON.stringify(book));
}
function hasText(id) { return fs.existsSync(path.join(TEXTS, id + '.json')); }
function readText(id) { return JSON.parse(fs.readFileSync(path.join(TEXTS, id + '.json'), 'utf8')); }

function asciiSlug(s, fallback = 'book') {
  const out = (s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’"“”:;,.!?()\[\]{}]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return out || fallback;
}

function countWords(paragraphs) {
  return paragraphs.reduce((n, p) => n + p.split(/\s+/).filter(Boolean).length, 0);
}

// Normalize + paragraph-ify raw plain text.
function rawToParagraphs(raw) {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '') // bidi control chars
    .split(/\n\s*\n+/)
    .map((blk) => blk.split('\n').map((l) => l.trim()).join(' '))
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .map((p) => p.replace(/_{1,}/g, '')) // _italics_ markup
    .filter((p) => p.length > 1 && !/^\[Illustration/i.test(p) && !/^\[Image/i.test(p));
}

// Strip Gutenberg boilerplate between the START/END markers.
function stripGutenbergBoilerplate(raw) {
  const start = raw.search(/\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i);
  let body = start >= 0 ? raw.slice(raw.indexOf('\n', start) + 1) : raw;
  const end = body.search(/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG EBOOK/i);
  if (end >= 0) body = body.slice(0, end);
  return body.trim();
}

// English chapter heading heuristics.
function isChapterHeading(line) {
  return /^\s*(CHAPTER|Chapter|PART|Part\s+[IVX0-9]|ACT|LETTER|BOOK\s+[IVX0-9]|STAVE|CANTO)\s+[IVXLC0-9A-Z]/.test(line)
    && line.trim().length < 80;
}

async function fetchPolite(url, retries = 2) {
  const headers = {
    'User-Agent': 'QirtasPipeline/1.0 (public-domain book aggregator; +https://qirtas.pages.dev)',
    'Accept-Language': 'en,ar;q=0.8',
  };
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow' });
      if (res.ok) return res;
      if (res.status === 404) throw new Error('404 ' + url);
      throw new Error('HTTP ' + res.status);
    } catch (e) {
      if (i === retries || /404/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) { console.log(new Date().toISOString().slice(11, 19), msg); }

module.exports = {
  ROOT, DATA, TEXTS, CATALOG, CACHE, COVERS, EMOJIS,
  readCatalog, writeCatalog, saveText, hasText, readText,
  asciiSlug, countWords, rawToParagraphs, stripGutenbergBoilerplate, isChapterHeading,
  fetchPolite, sleep, log,
};
