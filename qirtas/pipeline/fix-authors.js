// Fix-up pass: re-derive clean author names + descriptions for Gutenberg
// entries from the raw candidates metadata.
'use strict';
const fs = require('fs');
const path = require('path');
const { readCatalog, writeCatalog, log, CACHE } = require('./lib/common');

const yearRe = /^(b\.\s*|ca\.\s*|circa\s*)?[\d?]{1,4}(\s*[-–]\s*[\d?]{1,4})?(\s*(BCE|BC))?\s*$/i;

function prettyAuthor(raw) {
  if (!raw) return { display: 'Anonymous', deathYear: null };
  const first = raw.split(';')[0].trim();
  const parts = first.split(',').map((p) => p.trim()).filter(Boolean);
  const nameParts = parts.filter((p) => !yearRe.test(p));
  let display;
  if (nameParts.length === 2) display = nameParts[1] + ' ' + nameParts[0];
  else if (nameParts.length === 1) display = nameParts[0];
  else display = nameParts.slice().reverse().join(' ');
  const deathM = first.match(/(\d{3,4})\s*\)?\s*$/);
  const deathYear = /BCE|BC/i.test(first) ? null : (deathM ? Number(deathM[1]) : null);
  return { display, deathYear };
}

const catalog = readCatalog();
const candidates = JSON.parse(fs.readFileSync(path.join(CACHE, 'gutenberg-candidates.json'), 'utf8'));
const byGid = new Map(candidates.map((c) => [c.gid, c]));

let fixed = 0;
for (const b of catalog) {
  if (b.source !== 'gutenberg' || !b.gutenbergId) continue;
  const raw = byGid.get(String(b.gutenbergId));
  if (!raw) continue;
  const author = prettyAuthor(raw.authors);
  const subj = (raw.subjects || '').split('--')[0].trim();
  b.author = { ar: author.display, en: author.display };
  b.deathYear = author.deathYear;
  b.description = {
    en: `${b.title.en} by ${author.display}. ${subj ? subj + '.' : ''} A public-domain classic — free to read on Qirtas.`.replace(/\s+/g, ' '),
    ar: `${b.title.en} للكاتب ${author.display}. عمل كلاسيكي من الملكية العامة — اقرأه مجاناً على منصة قِرطاس بترقيم صفحات مريح ووضع ليلي ودعم كامل للعربية.`.replace(/\s+/g, ' '),
  };
  fixed++;
}
writeCatalog(catalog);
log('authors/descriptions fixed for ' + fixed + ' books');
for (const b of catalog.slice(0, 5)) log('  • ' + b.title.en.slice(0, 35) + ' — ' + b.author.en);
