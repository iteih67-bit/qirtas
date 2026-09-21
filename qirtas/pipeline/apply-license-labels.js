// Apply licence labels from the audit report (cache/license-audit.json) without
// re-fetching, and quarantine entries that look like modern publisher editions.
// Usage: node pipeline/apply-license-labels.js [--drop-review]
'use strict';
const fs = require('fs');
const path = require('path');
const { readCatalog, writeCatalog, log, CACHE, TEXTS } = require('./lib/common');

const DROP = process.argv.includes('--drop-review');
const auditFile = path.join(CACHE, 'license-audit.json');
const audit = fs.existsSync(auditFile) ? JSON.parse(fs.readFileSync(auditFile, 'utf8')) : { report: [] };
const status = new Map(audit.report.map((r) => [r.id, r]));

const POLICY_LABEL = { ar: 'ملكية عامة / رخصة حرة — حسب سياسة ويكي مصدر', en: 'Public domain / free licence — per Wikisource policy' };
const REVIEW_LABEL = { ar: 'يتطلب مراجعة ترخيص', en: 'Licence review required' };
// Titles that point at a modern publisher edition re-typed on Wikisource.
const MODERN_PUBLISHER = /هنداوي|Hindawi|دار الكتب والوثائق|الهيئة العامة للكتاب/i;

const catalog = readCatalog();
const toDrop = [];
let policy = 0, verified = 0, review = 0;

for (const b of catalog) {
  const src = b.sourceKey || b.source;
  if (src !== 'wikisource') continue;
  const title = (b.title && (b.title.ar || b.title.en)) || '';
  const note = (b.description && b.description.ar) || '';
  const r = status.get(b.id);

  if (MODERN_PUBLISHER.test(title) || MODERN_PUBLISHER.test(note)) {
    b.license = 'review-required';
    b.licenseLabel = REVIEW_LABEL;
    b.licenseAudit = 'modern-publisher-edition';
    review++;
    toDrop.push(b.id);
    continue;
  }
  if (r && r.status === 'FREE' && (b.licenseTemplates || []).length) {
    b.licenseAudit = 'verified-on-page';
    verified++;
    continue;
  }
  // Wikisource only hosts public-domain or freely licensed texts: platform-level basis.
  b.license = b.license === 'public-domain' ? 'public-domain' : 'wikisource-policy';
  b.licenseLabel = POLICY_LABEL;
  b.licenseAudit = 'platform-policy';
  b.licenseUrl = 'https://wikisource.org/wiki/Wikisource:Copyright';
  policy++;
}

let list = catalog;
if (DROP && toDrop.length) {
  const drop = new Set(toDrop);
  list = catalog.filter((b) => !drop.has(b.id));
  for (const id of toDrop) {
    const p = path.join(TEXTS, id + '.json');
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  log(`quarantined ${toDrop.length} modern-publisher editions: ${toDrop.join(', ')}`);
}

writeCatalog(list);
log(`licence labels — verified ${verified}, platform-policy ${policy}, review-required ${review}${DROP ? ' (quarantined)' : ''}`);
log(`catalog total: ${list.length}`);
