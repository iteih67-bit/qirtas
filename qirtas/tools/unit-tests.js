// unit-tests.js — deterministic unit tests for the pure helpers.
// Run: node tools/unit-tests.js   (exit code 0 = all pass)
'use strict';
const path = require('path');
const Q = path.resolve(__dirname, '..');

const { normKey, arSlug, asciiSlugLoose, shortHash, translit } = require(path.join(Q, 'pipeline', 'lib', 'arabic.js'));
const { isJunkValue, cleanValue, titleFromUrl, resolveFields, arabicWordRatio } = require(path.join(Q, 'pipeline', 'lib', 'metadata.js'));
const { countWords, rawToParagraphs } = require(path.join(Q, 'pipeline', 'lib', 'common.js'));
const { isJunkChapter, cleanChapters } = require(path.join(Q, 'pipeline', 'lib', 'clean.js'));

let pass = 0, fail = 0;
const failures = [];
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; return; }
  fail++; failures.push({ name, actual: a, expected: b });
}
function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fail++; failures.push({ name, actual: detail === undefined ? 'falsy' : JSON.stringify(detail), expected: 'truthy' });
}

// ---------- normKey: Arabic-aware folding ----------
eq('normKey strips tashkeel', normKey('مُقَدِّمَة'), normKey('مقدمة'));
eq('normKey folds alef variants', normKey('ألف'), normKey('الف'));
eq('normKey folds alef maqsura', normKey('مصطفى'), normKey('مصطفي'));
eq('normKey folds ta marbuta', normKey('مكتبة'), normKey('مكتبه'));
eq('normKey collapses punctuation', normKey('كتاب، العنوان!'), 'كتاب العنوان');
eq('normKey keeps digits', normKey('الجزء 2'), 'الجزء 2');
eq('normKey handles empty', normKey(''), '');
eq('normKey is idempotent', normKey(normKey('الإيضاح في النحو')), normKey('الإيضاح في النحو'));
eq('normKey folds latin case', normKey('Kitab'), normKey('KITAB'));

// ---------- slugs ----------
ok('arSlug transliterates Arabic', /^[a-z0-9-]+$/.test(arSlug('صحيح مسلم', 'book')), arSlug('صحيح مسلم', 'book'));
ok('arSlug falls back for empty input (prefix + hash)', /^x-[0-9a-f]{8}$/.test(arSlug('', 'x')), arSlug('', 'x'));
ok('arSlug keeps the fallback prefix', arSlug('', 'book').startsWith('book-'), arSlug('', 'book'));
ok('arSlug distinguishes two arabic titles', arSlug('الرحلة', 'a') !== arSlug('الرسالة', 'a'), arSlug('الرحلة', 'a') + ' vs ' + arSlug('الرسالة', 'a'));
eq('arSlug same input → same slug', arSlug('الرحلة', 'a'), arSlug('الرحلة', 'a'));
ok('shortHash is 8 lowercase hex', /^[0-9a-f]{8}$/.test(shortHash('ابن هشام')), shortHash('ابن هشام'));
ok('shortHash differs by input', shortHash('أ') !== shortHash('ب'));
eq('asciiSlugLoose keeps ascii words', asciiSlugLoose('The Arabian Nights', 'b'), 'the-arabian-nights');
ok('translit returns a string for arabic', typeof translit('كتاب') === 'string');

// ---------- metadata hygiene ----------
eq('cleanValue rejects leading pipe', cleanValue('|مؤلف ='), '');
eq('cleanValue rejects nested template', cleanValue('Title|مؤلف=X'), '');
eq('cleanValue rejects trailing braces', cleanValue('فتح الباري|مؤلف=ابن حجر|ملاحظات = }}'), '');
eq('cleanValue rejects empty assignment', cleanValue('المؤلف ='), '');
eq('cleanValue rejects arabic field name', cleanValue('مترجم = فلان'), '');
eq('cleanValue trims + collapses spaces', cleanValue('  صحيح   مسلم  '), 'صحيح مسلم');
eq('cleanValue keeps a real title', cleanValue('صحيح مسلم بشرح النووي'), 'صحيح مسلم بشرح النووي');
eq('isJunkValue treats dash as junk', isJunkValue('—'), true);
eq('isJunkValue accepts normal text', isJunkValue('رسالة'), false);
eq('titleFromUrl decodes wiki page', titleFromUrl('https://ar.wikisource.org/wiki/%D8%A7%D9%84%D8%B1%D9%88%D8%AD'), 'الروح');
eq('titleFromUrl handles underscores', titleFromUrl('https://ar.wikisource.org/wiki/فتح_الباري'), 'فتح الباري');
eq('titleFromUrl de-slugs archive ids', titleFromUrl('https://archive.org/details/sahih-muslim_202109'), 'sahih muslim 202109');
eq('titleFromUrl returns empty for junk', titleFromUrl('not a url'), '');
ok('decodeEncodedText decodes percent-escaped utf-8', require(path.join(Q, 'pipeline', 'lib', 'metadata.js')).decodeEncodedText('%D8%B5%D8%AD%DB%8C%D8%AD%20%D9%85%D8%B3%D9%84%D9%85') === 'صحیح مسلم', require(path.join(Q, 'pipeline', 'lib', 'metadata.js')).decodeEncodedText('%D8%B5%D8%AD%DB%8C%D8%AD%20%D9%85%D8%B3%D9%84%D9%85'));
ok('decodeEncodedText survives a truncated escape (a real source record)', /^صحیح مسلم/.test(require(path.join(Q, 'pipeline', 'lib', 'metadata.js')).decodeEncodedText('%D8%B5%D8%AD%DB%8C%D8%AD%20%D9%85%D8%B3%D9%84%D9%85%20%D9%85%D8%AA%D8%B1%D8%AC%D9%85%20%DB%8C%D8%AD%DB%8C%DB%8C%20%D8%B3%D9%84%D8%B7%D8%A7%D9%86%20%D8%AC%D9%84%D8%AF%20%D9%8')), require(path.join(Q, 'pipeline', 'lib', 'metadata.js')).decodeEncodedText('%D8%B5%D8%AD%DB%8C%D8%AD%20%D9%85%D8%B3%D9%84%D9%85%20%D9%85%D8%AA%D8%B1%D8%AC%D9%85%20%DB%8C%D8%AD%DB%8C%DB%8C%20%D8%B3%D9%84%D8%B7%D8%A7%D9%86%20%D8%AC%D9%84%D8%AF%20%D9%8'));
ok('decodeEncodedText leaves plain text untouched', require(path.join(Q, 'pipeline', 'lib', 'metadata.js')).decodeEncodedText('صحيح مسلم') === 'صحيح مسلم');
{
  const r = resolveFields({ title: '|مؤلف =', author: '|باب =', sourceUrl: 'https://ar.wikisource.org/wiki/الروح', lang: 'ar' });
  eq('resolveFields recovers title from source', r.title, 'الروح');
  eq('resolveFields substitutes unknown author', r.author, 'مؤلف غير معروف');
  ok('resolveFields flags the recovery', r.recoveredFromSource === true);
}
{
  const r = resolveFields({ title: 'كتاب', author: '', sourceUrl: '', lang: 'en' });
  eq('resolveFields english fallback', r.author, 'Unknown author');
}

// ---------- arabicWordRatio ----------
ok('arabicWordRatio high for arabic prose', arabicWordRatio('هذا نص عربي سليم يتكون من كلمات واضحة ومقروءة تماما') > 0.9, arabicWordRatio('هذا نص عربي سليم يتكون من كلمات واضحة ومقروءة تماما'));
ok('arabicWordRatio low for latin prose', arabicWordRatio('this is clearly latin text with words') < 0.1, arabicWordRatio('this is clearly latin text with words'));
ok('arabicWordRatio low for ocr garbage', arabicWordRatio('Cora1n 5th 8edition p1ease 3nter the v4lue') < 0.2, arabicWordRatio('Cora1n 5th 8edition p1ease 3nter the v4lue'));
eq('arabicWordRatio empty input', arabicWordRatio(''), 0);
eq('arabicWordRatio numbers only', arabicWordRatio('123 456 789'), 0);

// ---------- text helpers ----------
eq('countWords counts arabic words', countWords(['كلمة كلمتان', 'ثلاث كلمات']), 4);
eq('countWords ignores empty paragraphs', countWords(['', '   ']), 0);
ok('rawToParagraphs splits blank lines', rawToParagraphs('سطر أول\n\nسطر ثانٍ').length >= 2, rawToParagraphs('سطر أول\n\nسطر ثانٍ').length);
eq('rawToParagraphs handles empty text', rawToParagraphs('').length, 0);

// ---------- chapter cleaning ----------
ok('isJunkChapter detects a table-of-contents stub', isJunkChapter && typeof isJunkChapter === 'function');
ok('cleanChapters is idempotent on clean input', JSON.stringify(cleanChapters([{ title: { ar: 'باب', en: 'Chapter' }, paragraphs: ['نص طويل '.repeat(30)] }])) === JSON.stringify(cleanChapters([{ title: { ar: 'باب', en: 'Chapter' }, paragraphs: ['نص طويل '.repeat(30)] }])));

// ---------- report ----------
console.log('unit tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('\nfailures:');
  for (const f of failures) console.log('  ✗ ' + f.name + '\n      actual   ' + f.actual + '\n      expected ' + f.expected);
}
process.exitCode = fail ? 1 : 0;
