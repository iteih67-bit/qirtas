// Migrate the Qirtas catalog to the enriched schema (additive, idempotent).
// Usage: node pipeline/migrate-schema.js
'use strict';
const { readCatalog, writeCatalog, log } = require('./lib/common');

const SOURCES = {
  gutenberg: {
    label: { ar: 'مشروع جوتنبرج', en: 'Project Gutenberg' },
    license: 'public-domain',
    licenseLabel: { ar: 'ملكية عامة', en: 'Public domain' },
    licenseUrl: 'https://www.gutenberg.org/policy/license.html',
  },
  wikisource: {
    label: { ar: 'ويكي مصدر العربية', en: 'Arabic Wikisource' },
    license: 'public-domain',
    licenseLabel: { ar: 'ملكية عامة / رخصة حرة', en: 'Public domain / free license' },
    licenseUrl: 'https://wikisource.org/wiki/Wikisource:Copyright',
  },
  standardebooks: {
    label: { ar: 'ستاندرد إي بوكس', en: 'Standard Ebooks' },
    license: 'public-domain',
    licenseLabel: { ar: 'ملكية عامة', en: 'Public domain' },
    licenseUrl: 'https://standardebooks.org/about',
  },
  archiveorg: {
    label: { ar: 'أرشيف الإنترنت', en: 'Internet Archive' },
    license: 'public-domain',
    licenseLabel: { ar: 'ملكية عامة', en: 'Public domain' },
    licenseUrl: 'https://archive.org/about/terms.php',
  },
  hindawi: {
    label: { ar: 'مؤسسة هنداوي', en: 'Hindawi Foundation' },
    license: 'external-link-only',
    licenseLabel: { ar: 'قراءة من المصدر (رخصة المصدر)', en: 'Read at source (source license)' },
    licenseUrl: 'https://www.hindawi.org/',
  },
  librispeech: {
    label: { ar: 'ليفري فوكس (صوتي)', en: 'LibriVox (audio)' },
    license: 'public-domain',
    licenseLabel: { ar: 'ملكية عامة', en: 'Public domain' },
    licenseUrl: 'https://librivox.org/',
  },
};

const LANG_LABEL = {
  ar: { ar: 'العربية', en: 'Arabic' },
  en: { ar: 'الإنجليزية', en: 'English' },
  fr: { ar: 'الفرنسية', en: 'French' },
  de: { ar: 'الألمانية', en: 'German' },
  es: { ar: 'الإسبانية', en: 'Spanish' },
};

function sourceUrlFor(b, src) {
  if (b.sourceUrl) return b.sourceUrl;
  if (b.gutenbergId) return `https://www.gutenberg.org/ebooks/${b.gutenbergId}`;
  const t = (b.title && (b.title.ar || b.title.en)) || '';
  if (src === 'wikisource') return 'https://ar.wikisource.org/wiki/' + encodeURIComponent(t.replace(/\s+/g, '_'));
  return '';
}

function main() {
  const catalog = readCatalog();
  let touched = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const b of catalog) {
    const src = b.sourceKey || b.source || 'other';
    const meta = SOURCES[src] || {
      label: { ar: 'مصدر حر', en: 'Free source' },
      license: 'public-domain',
      licenseLabel: { ar: 'ملكية عامة / رخصة حرة', en: 'Public domain / free license' },
      licenseUrl: '',
    };
    const before = JSON.stringify(b);
    b.sourceKey = src;
    b.sourceLabel = b.sourceLabel || meta.label;
    b.sourceUrl = sourceUrlFor(b, src) || b.sourceUrl || '';
    b.license = b.license || meta.license;
    b.licenseLabel = b.licenseLabel || meta.licenseLabel;
    b.licenseUrl = b.licenseUrl || meta.licenseUrl;
    b.langLabel = b.langLabel || LANG_LABEL[b.lang] || { ar: b.lang, en: b.lang };
    b.updatedAt = today;
    if (!b.addedAt) b.addedAt = today;
    if (JSON.stringify(b) !== before) touched++;
  }

  writeCatalog(catalog);
  log(`migrate-schema: catalog=${catalog.length}, touched=${touched}`);
  const bySource = {};
  for (const b of catalog) bySource[b.sourceKey] = (bySource[b.sourceKey] || 0) + 1;
  log('by source: ' + JSON.stringify(bySource));
}

main();
