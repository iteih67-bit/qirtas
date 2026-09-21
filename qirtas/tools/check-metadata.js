// Detect malformed metadata records in the exported catalog.
'use strict';
const fs = require('fs');
const cat = JSON.parse(fs.readFileSync('C:\\Users\\AsaadM\\Documents\\Books\\qirtas\\site\\dist\\catalog.json', 'utf8'));
const bad = [];
for (const b of cat) {
  const t = typeof b.title === 'object' ? (b.title.ar || '') : String(b.title || '');
  const te = typeof b.title === 'object' ? (b.title.en || '') : '';
  const a = typeof b.author === 'object' ? (b.author.ar || '') : String(b.author || '');
  const reasons = [];
  const looksBroken = (s) => /^\s*[|{}]/.test(s) || /\{\{|=\s*$|^\|/.test(s) || /^(مؤلف|باب|عنوان|محرر|ناشر)\s*=/.test(s) || s.length < 2;
  if (looksBroken(t)) reasons.push('title');
  if (t.length > 180) reasons.push('title-too-long');
  if (looksBroken(a)) reasons.push('author');
  if (reasons.length) bad.push({ id: b.id, lang: b.lang, reasons, title: t.slice(0, 60), title_en: te.slice(0, 40), author: a.slice(0, 40), url: b.sourceUrl });
}
console.log('total books: ' + cat.length);
console.log('suspicious: ' + bad.length);
const byReason = {};
for (const b of bad) for (const r of b.reasons) byReason[r] = (byReason[r] || 0) + 1;
console.log('by reason: ' + JSON.stringify(byReason));
fs.writeFileSync('C:\\Users\\AsaadM\\Documents\\Books\\qirtas\\cache\\bad-metadata.json', JSON.stringify(bad, null, 2));
for (const b of bad.slice(0, 40)) console.log(`  ${b.lang} ${b.id} [${b.reasons.join(',')}] ar="${b.title}" en="${b.title_en}" by="${b.author}"`);
