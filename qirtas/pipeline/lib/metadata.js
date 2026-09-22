// pipeline/lib/metadata.js — one authoritative place for metadata hygiene.
//
// Before this module existed the same rules were copied into the harvesters, the
// sanitizer, the title audit and the enrichment tool. They drifted apart and a wiki
// template fragment ("فتح الباري|مؤلف=ابن حجر|ملاحظات = }}") reached the catalogue
// while one of the copies was silently disabled. Everything now imports from here.
'use strict';

/**
 * Some source records carry percent-escaped UTF-8 metadata ("%D8%B5%D8%AD...").
 * decodeURIComponent() throws on a malformed tail, so the escapes are decoded by
 * hand and the result is validated as UTF-8 before it is trusted.
 */
function decodeEncodedText(v) {
  const s = String(v == null ? '' : v);
  if (!/%[0-9A-Fa-f]{2}/.test(s)) return s;
  const bytes = Buffer.from(s.replace(/%([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))), 'binary');
  let out;
  try { out = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (e) {
    // truncated or mixed-encoding metadata: keep every readable character and drop the rest
    out = new TextDecoder('utf-8').decode(bytes);
  }
  // strip replacement characters, leftover escape fragments and trailing separators
  return out.replace(/\uFFFD/g, '').replace(/%[0-9A-Fa-f]{0,2}/g, '').replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A value that is a leaked wiki-template fragment rather than real metadata. */
function isJunkValue(v) {
  const t = String(v == null ? '' : v).trim();
  if (!t) return true;
  if (t === '-' || t === '—') return true;
  if (/^\|/.test(t)) return true;                       // "|مؤلف ="
  if (/[{}]{2}/.test(t)) return true;                   // "{{...}}"
  if (/\|/.test(t) && /(=|\{\})/.test(t)) return true;   // "Title|مؤلف=X"
  if (/^[^=]{0,24}=\s*$/.test(t)) return true;           // "المؤلف ="
  if (/^(مؤلف|باب|عنوان|محرر|ناشر|مترجم|سنة|وصف)\s*=/.test(t)) return true;
  return false;
}

/** Clean a metadata field, returning '' when it cannot be trusted. */
function cleanValue(v) {
  if (isJunkValue(v)) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** Recover a usable title from a source URL when the parsed title is unusable. */
function titleFromUrl(url) {
  try {
    const u = new URL(String(url));
    if (/wikisource\.org$/.test(u.hostname)) {
      const seg = decodeURIComponent(u.pathname.replace('/wiki/', '')).replace(/_/g, ' ');
      return cleanValue(seg.split('/')[0]);
    }
    if (/archive\.org$/.test(u.hostname)) {
      return cleanValue(decodeURIComponent(u.pathname.replace('/details/', '')).replace(/[_-]+/g, ' '));
    }
    return '';
  } catch (e) {
    return '';
  }
}

/** Pick a usable title/author pair, falling back to the source page name. */
function resolveFields({ title, author, sourceUrl, lang }) {
  const cleanAuthor = cleanValue(author);
  let cleanTitle = cleanValue(title);
  let recovered = false;
  if (!cleanTitle) { cleanTitle = titleFromUrl(sourceUrl); recovered = !!cleanTitle; }
  return {
    title: cleanTitle,
    author: cleanAuthor || (lang === 'ar' ? 'مؤلف غير معروف' : 'Unknown author'),
    recoveredFromSource: recovered,
  };
}

/**
 * Share of tokens that look like real Arabic words. Used to reject texts that are
 * unreadable OCR output. Thresholds are explicit so callers cannot silently drift.
 */
function arabicWordRatio(text, opts = {}) {
  const lettersRatio = opts.lettersRatio === undefined ? 0.6 : opts.lettersRatio;
  const minLen = opts.minLen === undefined ? 2 : opts.minLen;
  const maxLen = opts.maxLen === undefined ? 20 : opts.maxLen;
  const sample = String(text == null ? '' : text).slice(0, opts.sampleChars || 30000);
  const toks = sample.split(/\s+/).filter(Boolean);
  if (!toks.length) return 0;
  let ok = 0, considered = 0;
  for (const t of toks) {
    const letters = t.replace(/[^\p{L}]/gu, '');
    if (!letters) continue;
    considered++;
    const ar = (letters.match(/[\u0600-\u06FF]/g) || []).length;
    if (ar / letters.length > lettersRatio && letters.length >= minLen && letters.length <= maxLen) ok++;
  }
  return considered ? ok / considered : 0;
}

/**
 * Text-quality policy. Ratios come from arabicWordRatio(), and the verdict is the
 * same for every consumer: 'ok' is good enough to show, 'unusable' must be hidden,
 * anything between is 'review' (kept visible, flagged for a human look).
 */
const QUALITY_POLICY = { ok: 0.7, unusable: 0.55 };
function qualityVerdict(ratio, policy = QUALITY_POLICY) {
  if (ratio >= policy.ok) return 'ok';
  if (ratio >= policy.unusable) return 'review';
  return 'unusable';
}

module.exports = { decodeEncodedText, isJunkValue, cleanValue, titleFromUrl, resolveFields, arabicWordRatio, QUALITY_POLICY, qualityVerdict };
