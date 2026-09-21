// Shared text-quality filters for harvested chapters (Wikisource + Gutenberg).
// Keeps navigation stubs, redirect markers and near-empty pages out of the books.
'use strict';

const countWords = (paragraphs) => paragraphs.reduce((n, p) => n + p.split(/\s+/).filter(Boolean).length, 0);

const REDIRECT_RE = /^(تحويل\s*إلى|#تحويل|تحويل:|redirect(ed)?\s*(to|from)?\b)/i;
const NAV_RE = /^(صفحة|فهرس|قائمة|بوابة|تصنيف|قالب|مجلد|الجزء)\b\s*[:：]?\s*$/;
const STUB_RE = /^[.\-–—_\s]+$/;

function isJunkChapter(ch) {
  const title = (ch.title && (ch.title.ar || ch.title.en)) || '';
  const paragraphs = ch.paragraphs || [];
  if (!paragraphs.length) return true;

  const first = (paragraphs[0] || '').trim();
  const words = countWords(paragraphs);

  if (REDIRECT_RE.test(first) || REDIRECT_RE.test(title)) return true;
  if (NAV_RE.test(first) && words < 120) return true;
  if (words < 25) return true;
  if (paragraphs.every((p) => p.replace(/\s+/g, '').length < 30)) return true;
  if (paragraphs.every((p) => STUB_RE.test(p))) return true;
  return false;
}

/** Drop junk chapters and clean paragraph-level noise. Returns { chapters, dropped }. */
function cleanChapters(chapters) {
  let dropped = 0;
  const out = [];
  for (const ch of chapters) {
    const paragraphs = (ch.paragraphs || [])
      .map((p) => String(p).replace(/\s+/g, ' ').trim())
      .filter((p) => p && !STUB_RE.test(p) && !/^(تحويل إلى|#تحويل)/i.test(p));
    const candidate = { title: ch.title, paragraphs };
    if (isJunkChapter(candidate)) { dropped++; continue; }
    out.push(candidate);
  }
  // drop leading/trailing junk leftovers produced by cleaning
  while (out.length && isJunkChapter(out[0])) { out.shift(); dropped++; }
  while (out.length && isJunkChapter(out[out.length - 1])) { out.pop(); dropped++; }
  return { chapters: out, dropped };
}

module.exports = { isJunkChapter, cleanChapters, countWords };
