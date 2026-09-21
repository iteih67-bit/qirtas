// Arabic text helpers for the Qirtas pipeline: search normalization + ASCII slugs.
'use strict';

const crypto = require('crypto');

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g; // diacritics + tatweel

// Normalize Arabic (+ latin) text into a comparable search key.
function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const TR = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ٱ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th',
  'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's',
  'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f',
  'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y',
  'ى': 'a', 'ة': 'a', 'ء': '', 'ؤ': 'o', 'ئ': 'e', 'ﻻ': 'la', 'لا': 'la',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

// Transliterate a mostly-Arabic title into a readable ASCII slug.
function translit(s) {
  const clean = String(s || '').normalize('NFKD').replace(TASHKEEL, '');
  let out = '';
  for (const ch of clean) out += (TR[ch] !== undefined ? TR[ch] : ch);
  return out;
}

function shortHash(s) {
  return crypto.createHash('sha1').update(String(s || '')).digest('hex').slice(0, 8);
}

function asciiSlugLoose(s, fallback = 'book') {
  const out = translit(s)
    .toLowerCase()
    .replace(/['’"“”:;,.!?()\[\]{}«»ـ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return out || fallback;
}

function arSlug(title, fallbackPrefix = 'ar') {
  const base = asciiSlugLoose(title, '');
  const latin = (base.match(/[a-z]/g) || []).length;
  if (base.length >= 4 && latin >= 3) return base;
  return `${fallbackPrefix}-${shortHash(title)}`;
}

module.exports = { normKey, translit, arSlug, asciiSlugLoose, shortHash };
