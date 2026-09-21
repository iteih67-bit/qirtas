// Verify the licence of every Wikisource-sourced book by reading its root page
// wikitext on ar.wikisource.org and looking for licence templates.
// Usage: node pipeline/verify-licenses.js [--drop-nonfree]
'use strict';
const fs = require('fs');
const path = require('path');
const { readCatalog, writeCatalog, fetchPolite, sleep, log, CACHE } = require('./lib/common');

const DROP = process.argv.includes('--drop-nonfree');
const UA = 'QirtasBot/1.0 (public-domain library licence audit)';

const FREELY = [
  { re: /CC[- ]?BY[- ]?4\.0/i, key: 'cc-by-4.0' },
  { re: /CC[- ]?BY[- ]?3\.0/i, key: 'cc-by-3.0' },
  { re: /CC[- ]?BY[- ]?SA/i, key: 'cc-by-sa' },
  { re: /CC0/i, key: 'cc0' },
  { re: /PD[- ]old|ملكية عامة|الملكية العامة|public domain/i, key: 'public-domain' },
];
const NONFREE = [
  { re: /CC[- ]?BY[- ]?NC/i, key: 'cc-by-nc' },
  { re: /(?:^|[^A-Z])ND(?:[^A-Z]|$)/, key: 'nd' },
  { re: /CC[- ]?BY[- ]?NC[- ]?ND/i, key: 'cc-by-nc-nd' },
];

async function wikitext(title) {
  const qs = new URLSearchParams({ action: 'parse', format: 'json', prop: 'wikitext', page: title, redirects: '1' }).toString();
  const res = await fetchPolite(`https://ar.wikisource.org/w/api.php?${qs}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.info || 'parse error');
  return (j.parse && j.parse.wikitext && j.parse.wikitext['*']) || '';
}

(async () => {
  const catalog = readCatalog();
  const targets = catalog.filter((b) => (b.sourceKey || b.source) === 'wikisource');
  const report = [];
  let ok = 0, unknown = 0, nonfree = [];

  for (const b of targets) {
    const title = (b.sourceUrl || '').split('/wiki/')[1] || '';
    const decoded = decodeURIComponent(title).replace(/_/g, ' ');
    if (!decoded) { report.push({ id: b.id, status: 'no-url' }); continue; }
    try {
      const wt = await wikitext(decoded);
      const free = FREELY.filter((f) => f.re.test(wt)).map((f) => f.key);
      const bad = NONFREE.filter((f) => f.re.test(wt)).map((f) => f.key);
      b.licenseTemplates = [...new Set([...free, ...bad])].slice(0, 6);
      if (bad.length) {
        b.license = 'review-required';
        b.licenseLabel = { ar: 'يتطلب مراجعة ترخيص', en: 'Licence review required' };
        nonfree.push(b.id);
        report.push({ id: b.id, status: 'NONFREE?', tokens: b.licenseTemplates, title: decoded });
      } else if (free.length) {
        b.license = free[0] === 'public-domain' ? 'public-domain' : free[0];
        b.licenseLabel = {
          ar: free[0] === 'public-domain' ? 'ملكية عامة' : 'رخصة حرة (' + free[0] + ')',
          en: free[0] === 'public-domain' ? 'Public domain' : 'Free licence (' + free[0] + ')',
        };
        ok++;
        report.push({ id: b.id, status: 'FREE', tokens: b.licenseTemplates });
      } else {
        b.license = 'review-required';
        b.licenseLabel = { ar: 'يتطلب مراجعة ترخيص', en: 'Licence review required' };
        unknown++;
        report.push({ id: b.id, status: 'UNKNOWN', title: decoded });
      }
      await sleep(320);
    } catch (e) {
      report.push({ id: b.id, status: 'ERR', reason: String(e.message || e).slice(0, 70) });
      await sleep(400);
    }
  }

  let finalList = catalog;
  if (DROP && nonfree.length) {
    const drop = new Set(nonfree);
    finalList = catalog.filter((b) => !drop.has(b.id));
    for (const id of nonfree) {
      const p = path.join(__dirname, '..', 'books-data', 'texts', id + '.json');
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    log(`dropped ${nonfree.length} non-free candidates: ${nonfree.join(', ')}`);
  }

  writeCatalog(finalList);
  fs.writeFileSync(path.join(CACHE, 'license-audit.json'), JSON.stringify({ ok, unknown, nonfree, report }, null, 2));
  log(`verify-licenses: checked ${targets.length} — free ${ok}, unknown ${unknown}, non-free ${nonfree.length}${DROP ? ' (dropped)' : ''}`);
  log(`catalog total: ${finalList.length}`);
})();
