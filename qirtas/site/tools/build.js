// Qirtas static site generator — zero-dependency SSG (v2).
// Generates: home, /library/ search app, /stats/, SEO book pages, reader shells,
// category pages, about, feed.xml, sitemap.xml, robots.txt, 404, PWA manifest+SW,
// and copies the catalog + book texts for CDN delivery.
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, DATA, readCatalog, log, asciiSlug } = require('../../pipeline/lib/common');
const { arSlug, shortHash } = require('../../pipeline/lib/arabic');

const SITE = path.join(ROOT, 'site');
const DIST = path.join(SITE, 'dist');
const SITE_COUNTS = (() => {
  const c = readCatalog();
  return {
    books: c.length,
    arabic: c.filter((b) => b.lang === 'ar').length,
    wordsM: Math.round(c.reduce((n, b) => n + (b.words || 0), 0) / 1000000),
    licences: new Set(c.map((b) => (b.licenseLabel && b.licenseLabel.ar) || 'ملكية عامة')).size,
  };
})();

const SITE_URL = (process.env.SITE_URL || 'https://iteih67-bit.github.io/qirtas').replace(/\/$/, '');
// Path prefix the site is served from ('' at the domain root, '/qirtas' on GitHub Pages).
const SITE_BASE = (process.env.SITE_BASE !== undefined ? process.env.SITE_BASE : new URL(SITE_URL).pathname).replace(/\/$/, '');
const BUILD_DATE = new Date().toISOString();

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const escJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

// standard page header pattern for every content page
function pageHeadify(html) {
  return html
    .replace(/<h1 class="page-title">([\s\S]*?)<\/h1>\s*<p class="page-sub">([\s\S]*?)<\/p>/,
      '<header class="page-head"><h1 class="page-title">$1</h1><p class="lede">$2</p></header>')
    .replace(/<main class="container">/, '<main class="container" id="main">')
    .replace(/<main class="container" style=/g, '<main class="container" id="main" style=');
}

function write(rel, content) {
  content = pageHeadify(String(content));
  if (SITE_BASE) {
    // prefix root-absolute asset/link references so a sub-path deployment works
    content = String(content)
      .replace(/(href|src|action|poster)="\/(?!\/)/g, (m, a) => a + '="' + SITE_BASE + '/')
      .replace(/register\('\/assets\/sw\.js'\)/g, "register('" + SITE_BASE + "/assets/sw.js')");
  }
  const p = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

const titleOf = (b, lang) => (lang === 'ar'
  ? (b.title.ar || b.title.en)
  : (b.title.en || b.title.ar));
const baseAuthorSlug = (b) => (b.lang === 'ar' ? arSlug(authorOf(b, 'ar'), 'author') : asciiSlug(authorOf(b, 'en') || authorOf(b, 'ar'), 'author'));
// author names can slugify to the same string; keep one page per real name
const AUTHOR_SLUGS = new Map(); // slug -> author name
const authorSlug = (b) => {
  const name = authorOf(b, 'ar') || authorOf(b, 'en');
  let slug = baseAuthorSlug(b);
  const owner = AUTHOR_SLUGS.get(slug);
  if (owner && owner !== name) {
    slug = slug + '-' + shortHash(String(name));
    AUTHOR_SLUGS.set(slug, name);
  } else if (!owner) {
    AUTHOR_SLUGS.set(slug, name);
  }
  return slug;
};
const eraSlug = (e) => arSlug(e, 'era');
const authorOf = (b, lang) => (lang === 'ar'
  ? (b.author.ar || b.author.en)
  : (b.author.en || b.author.ar));
const dirOf = (b) => (b.lang === 'ar' ? 'rtl' : 'ltr');
const langName = (b) => (b.lang === 'ar' ? 'العربية' : b.lang === 'en' ? 'الإنجليزية' : b.lang);
const srcName = (b) => ((b.sourceLabel && b.sourceLabel.ar) || 'مصدر حر');

function shell({ title, desc, lang = 'ar', dir = 'rtl', body, extraHead = '', path: pagePath = '/', ogType = 'website', noIndex = false }) {
  const isReader = pagePath.startsWith('/read/');
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noIndex ? '<meta name="robots" content="noindex">' : ''}
<meta name="theme-color" content="#0e9488">
<script src="/assets/js/i18n.js"></script>
<script>window.QIRTAS={site:${escJson(SITE_URL)},build:${escJson(BUILD_DATE)}};</script> <!-- bootstrap script must run before any asset script -->
<link rel="canonical" href="${SITE_URL}${pagePath}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="قِرطاس">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE_URL}${pagePath}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="alternate" type="application/rss+xml" title="قِرطاس — أحدث الكتب" href="/feed.xml">
<link rel="stylesheet" href="/assets/css/site.css">
<link rel="stylesheet" href="/assets/css/library.css">
<link rel="stylesheet" href="/assets/css/reading.css">
${extraHead}
</head>
<body>
<a class="skip-link" href="#main">تخطَّ إلى المحتوى</a>
<header class="site-header"><div class="inner container">
  <a class="brand" href="/">
    <svg class="brand-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="2" y="2" width="44" height="44" rx="10" fill="#0e9488"/><rect x="12" y="12" width="24" height="24" rx="4" fill="#fffdf8"/><rect x="16" y="18" width="16" height="2.6" rx="1.3" fill="#0d645e"/><rect x="16" y="23" width="16" height="2.6" rx="1.3" fill="#0d645e"/><rect x="16" y="28" width="9" height="2.6" rx="1.3" fill="#0d645e"/><path d="M28 12 h6 v10 l-3 -2.6 -3 2.6 z" fill="#f5a623"/></svg>
    <span><span class="brand-name">قِرطاس</span><span class="brand-sub">اقرأ أينما كنت — مجاناً</span></span>
  </a>
  <nav class="site-nav">
    <a href="/library/" data-i18n="nav.library">المكتبة</a>
    <a href="/stats/" data-i18n="nav.stats">الإحصاءات</a>
    <a href="/about/" data-i18n="nav.about">عن المنصة</a>
  </nav>
  <div class="nav-actions">
    <a class="icon-btn" href="/library/" id="searchLink" title="ابحث في المكتبة" aria-label="ابحث في المكتبة">
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/></svg>
    </a>
    ${isReader ? '<a class="btn btn-ghost small" href="/" id="backLink">الرئيسية</a>' : ''}
    <button class="icon-btn" id="langBtn" title="تغيير لغة الواجهة إلى الإنجليزية" aria-label="تغيير لغة الواجهة">EN</button>
    <button class="icon-btn" id="themeBtn" title="الوضع الليلي">🌙</button>
  </div>
</div></header>
${body}
<footer class="site-footer"><div class="inner container">
  <div class="footer-grid">
    <div class="about">
      <h2>قِرطاس</h2>
      <p>مكتبة قراءة مجانية للكتب العربية والعالمية في الملكية العامة، مع إشعار حقوق واضح ومسار طلب إزالة لأصحاب الحقوق.</p>
      <p>${SITE_COUNTS.books} كتابًا كامل النص · ${SITE_COUNTS.arabic} بالعربية · ${SITE_COUNTS.wordsM} مليون كلمة</p>
    </div>
    <div>
      <h2>تصفّح</h2>
      <ul>
        <li><a href="/library/" data-i18n="nav.library">المكتبة</a></li>
        <li><a href="/authors/" data-i18n="nav.authors">المؤلفون</a></li>
        <li><a href="/stats/" data-i18n="nav.stats">الإحصاءات</a></li>
      </ul>
    </div>
    <div>
      <h2>السياسات</h2>
      <ul>
        <li><a href="/rights/" data-i18n="nav.rights">حقوق النشر</a></li>
        <li><a href="/privacy/" data-i18n="nav.privacy">الخصوصية</a></li>
        <li><a href="/about/" data-i18n="nav.about">عن المنصة</a></li>
      </ul>
    </div>
    <div>
      <h2>تواصل</h2>
      <ul>
        <li><a href="/contact/" data-i18n="nav.contact">راسلنا</a></li>
        <li><a href="/rights/">طلب إزالة / تحويل رابط</a></li>
        <li><a href="/feed.xml">RSS</a></li>
        <li><a href="/sitemap.xml">خريطة الموقع</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© ${new Date().getFullYear()} قِرطاس — المحتوى من الملكية العامة أو برخص حرة، مع ذكر المصدر.</span>
    <span>آخر تحديث: ${BUILD_DATE.slice(0, 10)} · ${SITE_COUNTS.books} كتابًا</span>
  </div>
</div></footer>
</div></footer>
<script>
(function(){var t=document.getElementById('themeBtn');
if(!t)return;
if(localStorage.getItem('q.theme')==='dark'){document.documentElement.dataset.theme='dark';t.textContent='☀️';}
t.addEventListener('click',function(){var d=document.documentElement.dataset.theme==='dark';document.documentElement.dataset.theme=d?'light':'dark';t.textContent=d?'🌙':'☀️';localStorage.setItem('q.theme',d?'light':'dark');});
if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/assets/sw.js').catch(function(){});});}
})();
</script>
</body>
</html>`;
}

function cardHTML(b) {
  const t = titleOf(b, 'ar');
  const a = authorOf(b, 'ar');
  const badge = srcName(b);
  const langBadge = b.lang === 'ar' ? 'عربي' : 'English';
  const licBadge = /ملكية عامة/.test(String((b.licenseLabel || {}).ar || '')) ? 'ملكية عامة' : 'رخصة حرة';
  return `<a class="book-card" href="/book/${b.id}/" aria-label="${esc(t)}">
    <span class="badges"><span class="badge">${langBadge}</span><span class="badge">${licBadge}</span></span>
    <div class="cover ${b.grad || 'cover-g3'}">
      <span class="cov-title">${esc(t)}</span>
      <span class="cov-author">${esc(a)}</span>
      <span class="cov-orn">${b.emoji || '📚'}</span>
    </div>
    <div class="book-meta" dir="${dirOf(b)}"><strong>${esc(t)}</strong><span>${esc(a)}${badge ? ' · ' + esc(badge) : ''}</span></div>
  </a>`;
}

function grid(list, limit) {
  const items = (limit ? list.slice(0, limit) : list).map(cardHTML).join('');
  return `<div class="book-grid">${items}</div>`;
}

/* ================= pages ================= */
function homePage(catalog, externalCount = 0) {
  const ar = catalog.filter((b) => b.lang === 'ar');
  const en = catalog.filter((b) => b.lang === 'en');
  const words = catalog.reduce((n, b) => n + (b.words || 0), 0);
  const latest = [...catalog].sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
  const featured = latest.slice(0, 24);
  const body = `
<main class="container">
  <section class="hero">
    <h1>الكلاسيكيات العربية والعالمية — <span class="accent">مجاناً، بلا حساب</span></h1>
    <p class="lead">مكتبة كتب الملكية العامة بقارئ عربي احترافي: ترقيم صفحات مريح، وضع ليلي، وحفظ تلقائي لموضعك. اقرأ من المتصفح مباشرة على أي جهاز.</p>
    <form class="hero-search" action="/library/" method="get" role="search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/></svg>
      <input id="homeSearch" name="q" type="search" placeholder="ابحث في ${catalog.length} كتاباً بالعنوان أو المؤلف…" autocomplete="off">
      <button class="btn btn-accent" type="submit">ابحث</button>
    </form>
    <div class="hero-stats">
      <div class="hstat"><strong>${catalog.length}</strong><span>كتاباً كاملاً</span></div>
      <div class="hstat"><strong>${ar.length}</strong><span>كتاباً بالعربية</span></div>
      <div class="hstat"><strong>${en.length}</strong><span>كتاباً بالإنجليزية</span></div>
      <div class="hstat"><strong>${(words / 1e6).toFixed(1)}M</strong><span>كلمة قابلة للقراءة</span></div>
      <div class="hstat"><strong>${externalCount.toLocaleString('en-US')}</strong><span>كتاباً في الكتالوج الخارجي</span></div>
    </div>
    <div class="trust-strip">
      <div class="item"><b>${catalog.length}</b><span>كتاب كامل النص</span></div>
      <div class="item"><b>${Math.round(catalog.reduce((n, b) => n + (b.words || 0), 0) / 1000000)}M</b><span>كلمة متاحة للقراءة</span></div>
      <div class="item"><b>${catalog.filter((b) => b.lang === 'ar').length}</b><span>كتاب بالعربية</span></div>
      <div class="item"><b>${new Set(catalog.map((b) => (b.licenseLabel && b.licenseLabel.ar) || 'ملكية عامة')).size}</b><span>حالات ترخيص موثّقة</span></div>
    </div>
    <p class="hero-links"><a href="/library/" data-i18n="cta.browseAll">تصفّح المكتبة كاملة ←</a> · <a href="/authors/" data-i18n="cta.byAuthor">تصفّح حسب المؤلف</a></p>
    <p class="hero-note">+ ${externalCount.toLocaleString('en-US')} كتاباً إضافياً في كتالوج مرجعي عالمي (بيانات وصفية فقط) بروابط قراءة مباشرة من الجهة الناشرة أو الأرشيف الرقمي.</p>
  </section>

  <div id="continueCard" class="continue-card hidden">
    <div class="info"><small>متابعة القراءة</small><strong id="contTitle"></strong><span id="contMeta"></span></div>
    <a class="btn" id="contBtn" href="#">متابعة</a>
  </div>

  <h2 class="section-title">أحدث الإضافات</h2>
  ${grid(featured)}
  <div class="section-more">
    <a class="btn btn-ghost" href="/library/" data-i18n="cta.browseAll">تصفّح المكتبة كاملة ←</a>
    <a class="btn btn-ghost" href="/authors/" data-i18n="cta.byAuthor">تصفّح حسب المؤلف ←</a>
  </div>
</main>
<script src="/assets/js/home.js"></script>`;
  return shell({
    title: 'قِرطاس — مكتبة الكلاسيكيات العربية والعالمية المجانية',
    desc: `اقرأ ${catalog.length} كتاباً كاملاً من الملكية العامة بالعربية والإنجليزية مجاناً: كليلة ودمنة، ألف ليلة وليلة، Moby Dick وأكثر — بقارئ مريح يعمل على أي جهاز.`,
    body,
    path: '/',
  });
}

function libraryPage(catalog, externalCount = 0) {
  const body = `
<main class="container">
  <h1 class="page-title">المكتبة الكاملة <span class="count-pill" id="libCount">${catalog.length}</span></h1>
  <p class="page-sub">ابحث بالعنوان أو باسم المؤلف، ثم اختر الكتاب واقرأه كاملاً مجاناً.</p>

  <div class="lib-toolbar">
    <div class="lib-search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/></svg>
      <input id="libSearch" type="search" placeholder="ابحث بالعنوان أو المؤلف…" data-i18n-ph="nav.search" autocomplete="off" aria-label="ابحث">
      <button class="icon-btn small hidden" id="libClear" aria-label="مسح">✕</button>
    </div>
  </div>

  <div class="lib-status" id="libStatus" role="status" aria-live="polite">جارٍ التحميل…</div>
  <div id="libResults"><div class="skeleton-grid" id="libSkeleton" aria-hidden="true">
      ${Array.from({ length: 12 }).map(() => '<div class="skeleton-card"><div class="sk-cover"></div><div class="sk-line"></div><div class="sk-line short"></div></div>').join('')}
    </div></div>
  <div class="lib-pager hidden" id="libPager">
    <button class="btn btn-ghost small" id="pagePrev">السابق</button>
    <span id="pageInfo">1 / 1</span>
    <button class="btn btn-ghost small" id="pageNext">التالي</button>
  </div>

  <section class="lib-external" id="libExternal">
    <div class="lib-ext-head">
      <div>
        <h2>المزيد من الكتب <span class="count-pill" id="extCount">${externalCount.toLocaleString('en-US')}</span></h2>
        <p>ملايين العناوين العربية والعالمية تُقتى خارج المكتبة المباشرة. اضغط لتوسيع نطاق البحث إلى كامل الفهرس المتاح، مع روابط تفتح الكتاب من مصدره الرسمي.</p>
      </div>
      <button class="btn btn-accent" id="extLoad">وسّع البحث خارج المكتبة</button>
    </div>
    <div id="extResults"></div>
  </section>
</main>
<script src="/assets/js/library.js"></script>`;
  return shell({
    title: `المكتبة الكاملة — ${catalog.length} كتاباً مجانياً | قِرطاس`,
    desc: `ابحث في ${catalog.length} كتاباً من الملكية العامة بالعربية والإنجليزية واقرأها كاملة مجاناً.`,
    body,
    path: '/library/',
  });
}

function statsPage(catalog, externalCount = 0) {
  const byLang = {};
  let words = 0;
  for (const b of catalog) {
    byLang[langName(b)] = (byLang[langName(b)] || 0) + 1;

    words += b.words || 0;
  }
  const rows = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td><td class="num">${((v / catalog.length) * 100).toFixed(1)}%</td></tr>`).join('');
  const top = [...catalog].sort((a, b) => (b.words || 0) - (a.words || 0)).slice(0, 15);
  const body = `
<main class="container">
  <h1 class="page-title">إحصاءات المكتبة</h1>
  <p class="page-sub">آخر تحديث: ${esc(BUILD_DATE.slice(0, 19).replace('T', ' '))} UTC</p>
  <div class="hero-stats">
    <div class="hstat"><strong>${catalog.length}</strong><span>كتاباً كاملاً هنا</span></div>
    <div class="hstat"><strong>${externalCount.toLocaleString('en-US')}</strong><span>كتاباً في الكتالوج الخارجي</span></div>
    <div class="hstat"><strong>${words.toLocaleString('en-US')}</strong><span>كلمة</span></div>
    <div class="hstat"><strong>${catalog.length.toLocaleString('en-US')}</strong><span>ملف EPUB للتنزيل</span></div>
    <div class="hstat"><strong>${(words / 250).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</strong><span>صفحة تقديرية</span></div>
  </div>
  <div class="stats-grid">
    <section><h2>حسب اللغة</h2><table class="stats-table"><thead><tr><th>اللغة</th><th>الكتب</th><th>النسبة</th></tr></thead><tbody>${rows(byLang)}</tbody></table></section>
    <section><h2>أطول الكتب</h2><table class="stats-table"><thead><tr><th>الكتاب</th><th>كلمة</th><th>فصل</th></tr></thead><tbody>
      ${top.map((b) => `<tr><td><a href="/book/${b.id}/">${esc(titleOf(b, 'ar'))}</a></td><td class="num">${(b.words || 0).toLocaleString('en-US')}</td><td class="num">${b.chapters || 0}</td></tr>`).join('')}
    </tbody></table></section>
  </div>
</main>`;
  return shell({
    title: `إحصاءات المكتبة — ${catalog.length} كتاباً و${(words / 1e6).toFixed(1)} مليون كلمة | قِرطاس`,
    desc: `إحصاءات منصة قِرطاس: عدد الكتب وإجمالي الكلمات المتاحة للقراءة المجانية.`,
    body,
    path: '/stats/',
  });
}

function bookPage(b, catalog, chapterTitles) {
  const related = catalog.filter((x) => x.cat === b.cat && x.id !== b.id).slice(0, 6);
  const toc = chapterTitles.slice(0, 80);
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Book',
    name: titleOf(b, 'ar'), alternateName: titleOf(b, 'en'),
    author: { '@type': 'Person', name: authorOf(b, 'ar') },
    inLanguage: b.lang,
    numberOfPages: b.chapters,
    description: (b.description && (b.description.ar || b.description.en)) || '',
    publisher: { '@type': 'Organization', name: 'قِرطاس' },
    isAccessibleForFree: true,
    license: (b.licenseUrl || 'https://creativecommons.org/publicdomain/mark/1.0/'),
    url: `${SITE_URL}/book/${b.id}/`,
    ...(b.sourceUrl ? { isBasedOn: b.sourceUrl } : {}),
  };
  const body = `
<main class="container">
  <nav class="crumbs"><a href="/">الرئيسية</a> / <a href="/library/">المكتبة</a></nav>
  <article class="book-hero">
    <div class="cover ${b.grad || 'cover-g3'}">
      <span class="cov-title">${esc(titleOf(b, 'ar'))}</span>
      <span class="cov-author">${esc(authorOf(b, 'ar'))}</span>
      <span class="cov-orn">${b.emoji || '📚'}</span>
    </div>
    <div>
      <h1 dir="${dirOf(b)}">${esc(titleOf(b, 'ar'))}</h1>
      <p class="by">تأليف: ${authorOf(b, 'ar') ? `<a href="/author/${authorSlug(b)}/"><b>${esc(authorOf(b, 'ar'))}</b></a>` : '<span class="unknown-author">مؤلف غير محدد</span>'}${b.year ? ' · ' + esc(String(b.year)) : ''}${b.deathYear ? ' (ت. ' + b.deathYear + ')' : ''}</p>
      <p class="desc">${esc((b.description && (b.description.ar || b.description.en)) || '')}</p>
      <div class="book-stats">
        <div><strong>${b.chapters}</strong><span>فصلاً</span></div>
        <div><strong>${((b.words || 0) / 1000).toFixed(0)}K</strong><span>كلمة</span></div>
        <div><strong>${esc(langName(b))}</strong><span>لغة النص</span></div>
        <div><strong>مجاني</strong><span>بلا تسجيل</span></div>
      </div>
      <div class="cta-row">
        <a class="btn btn-accent" href="/read/${b.id}/">📖 اقرأ الآن</a>
        <a class="btn btn-ghost" href="/download/${b.id}.epub" download>⬇️ تنزيل EPUB</a>
        <a class="btn btn-ghost" href="/read/${b.id}/?print=1" target="_blank" rel="noopener">🖨️ PDF / طباعة</a>
        ${b.sourceUrl ? `<a class="btn btn-ghost" href="${esc(b.sourceUrl)}" target="_blank" rel="noopener nofollow">المصدر الأصلي ↗</a>` : ''}
      </div>
    </div>
  </article>

  <div class="toc-box">
    <h2>فهرس الفصول <span class="count-pill">${b.chapters}</span></h2>
    <ul class="toc-list">
      ${toc.map((t, i) => `<li><a href="/read/${b.id}/?ch=${i + 1}"><span class="n">${i + 1}</span><span dir="${dirOf(b)}">${esc(t)}</span></a></li>`).join('')}
    </ul>
    ${b.chapters > toc.length ? `<p class="toc-more">… و${b.chapters - toc.length} فصلاً آخر داخل القارئ.</p>` : ''}
  </div>

  <div class="source-box">
    <h2>المصدر والترخيص</h2>
    <ul>
      <li><span>المصدر</span><b>${esc(srcName(b) || '—')}</b></li>
      <li><span>الترخيص</span><b>${esc((b.licenseLabel && b.licenseLabel.ar) || 'ملكية عامة')}</b></li>
      <li><span>تفاصيل الترخيص</span>${b.licenseUrl ? `<a href="${esc(b.licenseUrl)}" target="_blank" rel="noopener nofollow">صفحة الرخصة ↗</a>` : '<b>—</b>'}</li>
      <li><span>رابط النص الأصلي</span>${b.sourceUrl ? `<a href="${esc(b.sourceUrl)}" target="_blank" rel="noopener nofollow">${esc(b.sourceUrl)} ↗</a>` : '<b>—</b>'}</li>
      <li><span>صاحب حق؟</span><a href="/rights/?t=${encodeURIComponent(titleOf(b, 'ar'))}&u=${encodeURIComponent(`${SITE_URL}/book/${b.id}/`)}">اطلب تحويل الرابط إلى موقعك الرسمي أو إزالة الكتاب ↗</a></li>
    </ul>
    <p class="license-note">النص في الملكية العامة أو منشور برخصة حرة، ويمكن قراءته وتوزيعه بحرية مع الإشارة إلى المصدر. وجدت خطأ في النص؟ <a href="/about/">أخبرنا</a>.</p>
  </div>

  <h2 class="section-title">كتب مشابهة</h2>
  ${grid(related)}
</main>
<script type="application/ld+json">${escJson(jsonLd)}</script>`;
  return shell({
    title: `${titleOf(b, 'ar')} — ${authorOf(b, 'ar')} | اقرأ مجاناً على قِرطاس`,
    desc: (((b.description && (b.description.ar || b.description.en)) || '').slice(0, 158)),
    body,
    ogType: 'book',
    path: `/book/${b.id}/`,
  });
}

function readerShell(b) {
  const body = `
<div class="reader-app">
  <div class="reader-top">
    <a class="icon-btn" href="/book/${b.id}/" aria-label="رجوع"><svg viewBox="0 0 24 24" class="flip-rtl" width="20" height="20"><path fill="currentColor" d="M15.5 4.5 8 12l7.5 7.5 1.4-1.4L10.8 12l6.1-6.1z"/></svg></a>
    <div class="titles"><strong id="rBookTitle">${esc(titleOf(b, 'ar'))}</strong><span id="rChapTitle">…</span></div>
    <div class="reader-tools">
      <button class="icon-btn small" id="fontMinus" title="تصغير الخط">A−</button>
      <button class="icon-btn small" id="fontPlus" title="تكبير الخط">A+</button>
      <button class="icon-btn small" id="fontMode" title="تبديل خط القراءة">خط: نسخ</button>
      <a class="icon-btn small" id="btnEpub" href="/download/${b.id}.epub" title="تنزيل EPUB">EPUB</a>
      <button class="icon-btn small" id="btnPrint" title="طباعة أو حفظ PDF">PDF</button>
      <button class="icon-btn" id="tocBtn" aria-label="الفهرس"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M4 5h16v2H4zm0 6h16v2H4zm0 6h10v2H4z"/></svg></button>
    </div>
  </div>
  <div class="reader-stage">
    <button class="edge-btn edge-start" id="prevPage" aria-label="السابق"><svg viewBox="0 0 24 24" class="flip-rtl"><path fill="currentColor" d="M15.5 4.5 8 12l7.5 7.5 1.4-1.4L10.8 12l6.1-6.1z"/></svg></button>
    <div id="readerContent" dir="auto"></div>
    <button class="edge-btn edge-end" id="nextPage" aria-label="التالي"><svg viewBox="0 0 24 24" class="flip-rtl"><path fill="currentColor" d="M8.5 4.5 16 12l-7.5 7.5-1.4-1.4L13.2 12 7.1 5.9z"/></svg></button>
  </div>
  <div class="reader-bottom">
    <div class="progress-track"><div class="progress-fill" id="progressFill"></div></div>
    <div class="reader-footer">
      <button class="btn btn-ghost small" id="prevChapter">الفصل السابق</button>
      <span id="pageIndicator">1 / 1</span>
      <button class="btn btn-ghost small" id="nextChapter">الفصل التالي</button>
    </div>
    <div class="ad-banner" id="adBanner"><span class="ad-tag">Ad · إعلان</span><span id="adBannerText">مساحة إعلانية تجريبية</span></div>
  </div>
</div>

<div id="tocOverlay" class="overlay hidden">
  <div class="sheet"><div class="sheet-head"><strong>الفهرس</strong><button class="icon-btn" id="tocClose">✕</button></div>
  <ul class="toc-sheet-list" id="tocList"></ul></div>
</div>

<div id="interstitial" class="overlay hidden" style="align-items:center">
  <div class="sheet" style="max-width:420px;border-radius:20px;text-align:center">
    <div style="font-size:3rem;margin:8px 0">📚</div>
    <strong id="interTitle" style="display:block;font-size:1.1rem">مساحة إعلانية تجريبية</strong>
    <p id="interSub" style="color:var(--ink-soft);font-size:.85rem;line-height:1.8">هنا يظهر إعلان بين الفصول</p>
    <button class="btn btn-accent" id="interstitialClose" disabled>إغلاق (5)</button>
  </div>
</div>
<div id="toast" class="toast hidden"></div>
<noscript><div class="container" style="padding:40px 0">يحتاج القارئ إلى تفعيل JavaScript. <a href="/book/${b.id}/">عد لصفحة الكتاب</a>.</div></noscript>
<script>window.QBOOK_LANG = '${b.lang}';</script>
  <script src="/assets/js/translate.js"></script>
  <script src="/assets/js/reader.js"></script>`;
  return shell({
    title: `${titleOf(b, 'ar')} — اقرأ مجاناً | قِرطاس`,
    desc: `اقرأ ${titleOf(b, 'ar')} لـ${authorOf(b, 'ar')} كاملاً ومجاناً على قِرطاس.`,
    body,
    path: `/read/${b.id}/`,
    noIndex: false,
  });
}


function aboutPage(catalog, externalCount = 0) {
  const ar = catalog.filter((b) => b.lang === 'ar').length;
  const en = catalog.length - ar;
  const words = catalog.reduce((s, b) => s + (b.words || 0), 0);
  const body = `
<main class="container" style="max-width:760px">
  <h1 class="page-title">عن قِرطاس</h1>
  <p class="prose">قِرطاس منصة قراءة مجانية تجمع كتب الملكية العامة بالعربية والإنجليزية في مكان واحد بتجربة قراءة حديثة: ترقيم صفحات أفقي مريح للعربية، وضع ليلي، حفظ تلقائي لموضعك، وتنزيل نسخة EPUB تُقرأ على أي جهاز — بلا حساب ولا رسوم.</p>
  <p class="prose">جميع الكتب المتاحة للقراءة الكاملة هنا في الملكية العامة (مؤلفون متوفون منذ أكثر من 70 عاماً) أو منشورة برخص حرة تسمح بإعادة النشر مع الإشارة إلى المصدر. لا نستضيف كتباً محمية بحقوق ناشرين، ولا نتجاوز أي قيود تقنية على المواقع، ولا ننزّل ملفات من مصادر غير مرخّصة.</p>
  <h2>محتوى المنصة</h2>
  <table class="stats-table"><thead><tr><th>النوع</th><th>العدد</th></tr></thead><tbody>
    <tr><td>نصوص كاملة متاحة للقراءة والتنزيل</td><td class="num">${catalog.length.toLocaleString('en-US')}</td></tr>
    <tr><td>منها بالعربية / بالإنجليزية</td><td class="num">${ar} / ${en}</td></tr>
    <tr><td>إجمالي الكلمات المتاحة للقراءة</td><td class="num">${(words / 1000000).toFixed(2)}M</td></tr>
    <tr><td>عناوين في كتالوج مرجعي بروابط خارجية</td><td class="num">${externalCount.toLocaleString('en-US')}</td></tr>
  </tbody></table>
  <p class="prose">المنصة تتوسّع باستمرار، وكل كتاب يعرض حالته الحقوقية ورابط مصدره، ويحق لأي صاحب حق طلب تحويل الرابط أو الإزالة بعد المراجعة.</p>
  <h2>الإبلاغ عن خطأ</h2>
  <p class="prose">إن وجدت خطأ في نص أو ترقيم، أو أردت اقتراح كتاب، راسلنا — نُصلح النصوص باستمرار بفضل إبلاغات القراء. وإن كنت <b>صاحب حقوق</b> أي كتاب معروض، فاستخدم <a href="/rights/">صفحة حقوق النشر</a> لتحويل الرابط إلى موقعك الرسمي أو لإزالة البيانات.</p>
  <h2>كيف تقرأ معنا</h2>
  <p class="prose">افتح صفحة أي كتاب ثم اختر «اقرأ الآن»: التنقل بين الصفحات بالسحب أو بأسهم لوحة المفاتيح، وتغيير حجم الخط ووضع القراءة الليلي من شريط الأدوات. وإن أردت القراءة بلا إنترنت، نزّل ملف EPUB وافتحه في قارئك المفضل على الهاتف أو الحاسوب.</p>
</main>`;
  return shell({ title: 'عن قِرطاس — منصة قراءة مجانية للملكية العامة', desc: 'منصة قراءة مجانية لكتب الملكية العامة: المحتوى، الترخيص، والإبلاغ عن الأخطاء.', body, path: '/about/' });
}

function rightsPage() {
  const body = `
<main class="container" style="max-width:860px">
  <h1 class="page-title">حقوق النشر وطلب أصحاب الحقوق</h1>
  <p class="prose">قِرطاس منصة قراءة لمحتوى في الملكية العامة أو منشور برخص حرة تسمح بإعادة النشر.
  لا نستضيف أي كتاب محمي بحقوق ناشر داخل المكتبة المتاحة للقراءة، وما يظهر من كتب حديثة يظهر
  كـ<b>بيانات كتالوج خارجي</b> (عنوان، مؤلف، سنة) مع رابط يَنقلك إلى المصدر الأصلي فقط.</p>

  <div class="rights-box">
    <h2>مبدأ المنصة</h2>
    <ul>
      <li>النصوص الكاملة تُنشر فقط إذا كانت في الملكية العامة أو تحت رخصة حرة.</li>
      <li>لكل كتاب في المكتبة قسم «المصدر والترخيص» يوضح مصدره وحكمه ورابط النص الأصلي.</li>
      <li>الكتالوج الخارجي يعرض بيانات وروابط قراءة من المصدر، ولا ننسخ ملفات أحد.</li>
      <li>أي طلب من صاحب حق يُعالج خلال أيام عمل قليلة، وبشكل مجاني.</li>
    </ul>
  </div>

  <div class="rights-box">
    <h2>إن كنت تملك حقوق كتاب معروض هنا</h2>
    <p class="prose">املأ النموذج التالي وسنجهز لك رسالة بريد إلكتروني جاهزة للإرسال:
    <a href="mailto:rights@qirtas.example" id="rightsMail">rights@qirtas.example</a></p>
    <form id="rightsForm" class="rights-form">
      <label>عنوان الكتاب <input id="rTitle" name="title" required placeholder="مثال: اسم الكتاب"></label>
      <label>اسمك أو اسم الجهة <input id="rName" name="name" required placeholder="مثال: دار النشر / المؤلف / الوكيل"></label>
      <label>صفتك
        <select id="rRole" name="role">
          <option>المؤلف</option>
          <option>الناشر</option>
          <option>الوريث / صاحب الحق</option>
          <option>الوكيل القانوني</option>
        </select>
      </label>
      <label>رابط الصفحة على قِرطاس (إن وجد) <input id="rUrl" name="url" placeholder="https://…"></label>
      <label>المطلوب
        <select id="rAction" name="action">
          <option>تحويل الرابط إلى الموقع الرسمي للكتاب أو دار النشر</option>
          <option>إزالة البيانات نهائيًا من الكتالوج</option>
          <option>إضافة زر «اشترِ / اقرأ رسميًا» بجانب الكتاب</option>
        </select>
      </label>
      <label>رابط الموقع الرسمي للكتاب أو الناشر <input id="rOfficial" name="official" placeholder="https://…"></label>
      <label>ملاحظات إضافية <textarea id="rNotes" name="notes" rows="3"></textarea></label>
      <div class="rights-actions">
        <button class="btn btn-accent" type="submit">تجهيز رسالة الطلب</button>
        <a class="btn btn-ghost" id="rSend" href="mailto:rights@qirtas.example">إرسال الطلب</a>
      </div>
    </form>
    <p class="rights-note">سنطلب إثباتًا بسيطًا للحق (صفحة الكتاب الرسمية، أو جهة النشر، أو ما يوضح ملكيتك) ونستجيب دون أي مقابل.</p>
  </div>

  <div class="rights-box">
    <h2>ماذا يحدث بعد الطلب؟</h2>
    <ol>
      <li>نوقف عرض النص المستضاف فورًا إن كان مطروحًا، ونزيله من صفحة الكتاب والبحث والملفات.</li>
      <li>نستبدل الرابط برابط الموقع الرسمي أو دار النشر الذي تحدده.</li>
      <li>نضيف وسم «نسخة رسمية» بجانب الكتاب.</li>
      <li>ننشر تحديثًا في سجل التغييرات، ونخبرك بالنتيجة بالبريد.</li>
    </ol>
    <p class="prose">بيانات الكتالوج تأتي من قواعد بيانات عامة (Open Library / أرشيف الإنترنت)، ولذلك قد تظهر بيانات كتاب ما بشكل تلقائي — ونحن نحترم دائمًا رغبة صاحب الحق في تصحيحها أو إزالتها.</p>
  </div>
</main>
<script>
(function(){
  var qs = new URLSearchParams(location.search);
  var t = qs.get('t') || '';
  var u = qs.get('u') || '';
  var f = document.getElementById('rightsForm');
  if (!f) return;
  if (t) document.getElementById('rTitle').value = t;
  if (u) document.getElementById('rUrl').value = u;
  function val(id){ return (document.getElementById(id) || {}).value || ''; }
  function build(){
    var subj = 'طلب صاحب حق بخصوص كتاب: ' + val('rTitle');
    var body = 'عنوان الكتاب: ' + val('rTitle') + '\\n' +
      'الاسم / الجهة: ' + val('rName') + '\\n' +
      'الصفة: ' + val('rRole') + '\\n' +
      'رابط الصفحة على قِرطاس: ' + val('rUrl') + '\\n' +
      'المطلوب: ' + val('rAction') + '\\n' +
      'الموقع الرسمي: ' + val('rOfficial') + '\\n' +
      'ملاحظات: ' + val('rNotes');
    return 'mailto:rights@qirtas.example?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
  }
  function sync(){ document.getElementById('rSend').href = build(); }
  f.addEventListener('input', sync);
  f.addEventListener('change', sync);
  f.addEventListener('submit', function(e){ e.preventDefault(); sync(); location.href = build(); });
  sync();
})();
</script>`;
  return shell({
    title: 'حقوق النشر وطلب أصحاب الحقوق | قِرطاس',
    desc: 'سياسة قِرطاس لحقوق النشر: ننشر الملكية العامة والرخص الحرة فقط، ولأصحاب الحقوق نموذج طلب لتحويل الرابط إلى الموقع الرسمي أو إزالة البيانات.',
    body,
    path: '/rights/',
  });
}

function contactPage() {
  const body = `
<main class="container" style="max-width:720px">
  <h1 class="page-title">تواصل معنا</h1>
  <p class="prose">نرحّب بالاقتراحات والإبلاغ عن الأخطاء وطلبات أصحاب الحقوق. للتواصل السريع:</p>
  <ul class="prose">
    <li>البريد العام: <a href="mailto:hello@qirtas.example">hello@qirtas.example</a></li>
    <li>طلبات حقوق النشر وإزالة المحتوى: <a href="/rights/">صفحة حقوق النشر</a> أو <a href="mailto:rights@qirtas.example">rights@qirtas.example</a></li>
    <li>اقتراح كتاب جديد: أرسل العنوان والمؤلف وسنة النشر إلى البريد العام وسنراجع إضافته.</li>
  </ul>
  <p class="prose">نردّ عادة خلال أيام عمل قليلة.</p>
</main>`;
  return shell({ title: 'تواصل معنا | قِرطاس', desc: 'التواصل مع فريق قِرطاس: اقتراحات، إبلاغ عن أخطاء، وطلبات حقوق النشر.', body, path: '/contact/' });
}

function privacyPage() {
  const body = `
<main class="container" style="max-width:760px">
  <h1 class="page-title">سياسة الخصوصية</h1>
  <p class="prose">نحترم خصوصيتك ونجمع أقل قدر ممكن من البيانات لتشغيل الموقع:</p>
  <ul class="prose">
    <li><b>على جهازك فقط:</b> موضع القراءة، المفضلة، حجم الخط، والثيم تُحفظ في متصفحك (localStorage) ولا تُرسل إلى أي خادم.</li>
    <li><b>عند إرسال طلب إزالة:</b> نحفظ الاسم والصفة والبريد ونص الطلب لغرض مراجعة الطلب فقط.</li>
    <li><b>لا نستخدم حسابات ولا تتبّعًا إعلانيًا</b> ولا نبيع أي بيانات.</li>
    <li><b>سجلات الخادم:</b> تُسجّل الطلبات الفنية كعنوان الشبكة ووقت الطلب لأغراض الأمان ومنع الإساءة.</li>
    <li><b>حقوقك:</b> يمكنك طلب حذف بياناتك المرسلة عبر البريد العام.</li>
  </ul>
</main>`;
  return shell({ title: 'سياسة الخصوصية | قِرطاس', desc: 'ما نجمعه من بيانات وكيف نستخدمه: تخزين محلي للقراءة، وبيانات محدودة لطلبات حقوق النشر.', body, path: '/privacy/' });
}

function authorPage(name, books) {
  const body = `
<main class="container">
  <nav class="crumbs"><a href="/">الرئيسية</a> / <a href="/library/">المكتبة</a> / <a href="/authors/">المؤلفون</a></nav>
  <h1 class="page-title">${esc(name)} <span class="count-pill">${books.length}</span></h1>
  <p class="page-sub">كل كتب هذا المؤلف المتاحة للقراءة هنا.</p>
  ${grid(books)}
</main>`;
  return shell({
    title: `${name} — كتب مجانية للقراءة | قِرطاس`,
    desc: `اقرأ ${books.length} كتابًا لـ${name} مجانًا على قِرطاس.`,
    body,
    path: `/author/${authorSlug(books[0])}/`,
  });
}

function authorsIndex(authorMap) {
  const entries = Object.entries(authorMap).sort((a, b) => b[1].length - a[1].length);
  const body = `
<main class="container">
  <h1 class="page-title">المؤلفون <span class="count-pill">${entries.length}</span></h1>
  <p class="page-sub">تصفّح المكتبة حسب المؤلف.</p>
  <div class="author-grid">
    ${entries.map(([name, list]) => `<a class="author-chip" href="/author/${authorSlug(list[0])}/">${esc(name)} <i>${list.length}</i></a>`).join('')}
  </div>
</main>`;
  return shell({ title: `المؤلفون — ${entries.length} مؤلفًا | قِرطاس`, desc: 'تصفّح مكتبة قِرطاس حسب المؤلف.', body, path: '/authors/' });
}


function notFoundPage() {
  const body = `
<main class="container" style="text-align:center;padding:70px 20px">
  <div style="font-size:4rem;line-height:1">📕</div>
  <h1 style="font-size:2.4rem;margin:10px 0">404 — الصفحة غير موجودة</h1>
  <p style="color:var(--ink-soft);max-width:520px;margin:0 auto 26px">قد يكون الرابط قديماً أو أن الكتاب أُزيل. جرّب البحث في المكتبة الكاملة.</p>
  <form class="hero-search" action="/library/" method="get" role="search" style="max-width:520px;margin:0 auto 22px">
    <input name="q" type="search" placeholder="ابحث عن كتاب أو مؤلف…" autocomplete="off">
    <button class="btn btn-accent" type="submit">ابحث</button>
  </form>
  <p><a class="btn btn-ghost" href="/library/">تصفّح المكتبة</a> <a class="btn btn-ghost" href="/">الرئيسية</a></p>
</main>`;
  return shell({ title: '404 — الصفحة غير موجودة | قِرطاس', desc: 'الصفحة غير موجودة', body, path: '/404.html', noIndex: true });
}

/* ================= build ================= */
function feedXML(catalog) {
  const latest = [...catalog].sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || ''))).slice(0, 50);
  const items = latest.map((b) => `  <item>
    <title>${esc(titleOf(b, 'ar'))} — ${esc(authorOf(b, 'ar'))}</title>
    <link>${SITE_URL}/book/${b.id}/</link>
    <guid isPermaLink="true">${SITE_URL}/book/${b.id}/</guid>
    <description>${esc(((b.description && (b.description.ar || b.description.en)) || '').slice(0, 300))}</description>
    <pubDate>${new Date(b.addedAt || BUILD_DATE).toUTCString()}</pubDate>
  </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>قِرطاس — أحدث الكتب المجانية</title>
  <link>${SITE_URL}/</link>
  <description>كتب الملكية العامة بالعربية والإنجليزية — تُضاف كتب جديدة باستمرار.</description>
  <language>ar</language>
  <lastBuildDate>${new Date(BUILD_DATE).toUTCString()}</lastBuildDate>
${items}
</channel></rss>`;
}

function manifestJSON() {
  const icons = [];
  const dir = path.join(ROOT, '..', 'reading-app-mvp', 'icons');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^icon-(\d+)\.png$/);
      if (m) icons.push({ src: `${SITE_BASE}/icons/${f}`, sizes: `${m[1]}x${m[1]}`, type: 'image/png', purpose: 'any' });
    }
  }
  if (!icons.length) icons.push({ src: SITE_BASE + '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' });
  return JSON.stringify({
    name: 'قِرطاس — مكتبة الملكية العامة',
    short_name: 'قِرطاس',
    description: 'اقرأ آلاف الكتب العربية والإنجليزية من الملكية العامة مجاناً.',
    start_url: SITE_BASE + '/library/',
    scope: SITE_BASE + '/',
    display: 'standalone',
    dir: 'rtl',
    lang: 'ar',
    background_color: '#f4efe6',
    theme_color: '#0e9488',
    icons,
  }, null, 2);
}

const SW_JS = `/* Qirtas service worker — offline shell + book texts */
'use strict';
const V = 'qirtas-v2';
const SHELL = ['/', '/library/', '/stats/', '/about/', '/books-index.json', '/catalog.json',
  '/assets/css/site.css', '/assets/css/library.css', '/assets/js/library.js', '/assets/js/home.js', '/assets/js/reader.js'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url).pathname;
  const cacheFirst = url.startsWith('/books/') || url.startsWith('/assets/') || url.startsWith('/fonts/') || url.startsWith('/icons/');
  if (cacheFirst) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(V).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('/library/'))));
    return;
  }
  e.respondWith(fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(V).then((c) => c.put(req, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('/library/'))));
});
`;

(async () => {
  const catalog = readCatalog();
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  let external = [];
  const extFile = path.join(DATA, 'external.json');
  if (fs.existsSync(extFile)) {
    try { external = JSON.parse(fs.readFileSync(extFile, 'utf8')); } catch (e) { log('⚠ external.json unreadable: ' + e.message); }
  }

  write('index.html', homePage(catalog, external.length));
  write('library/index.html', libraryPage(catalog, external.length));
  write('stats/index.html', statsPage(catalog, external.length));
  write('about/index.html', aboutPage(catalog, external.length));
  write('rights/index.html', rightsPage());
  write('contact/index.html', contactPage());
  write('privacy/index.html', privacyPage());
  write('404.html', notFoundPage());
  write('catalog.json', JSON.stringify(catalog));
  write('feed.xml', feedXML(catalog));
  if (external.length) {
    write('external-index.json', JSON.stringify(external));
    log(`external catalogue: ${external.length} entries → dist/external-index.json`);
  }
  write('manifest.webmanifest', manifestJSON());


  // browse by author and by era
  const authorMap = {};
  for (const b of catalog) {
    const name = authorOf(b, 'ar').trim();
    if (!name || name === 'مجهول' || name === 'مؤلف تراثي' || name === 'مؤلف غير معروف') continue; // placeholder, not an author
    (authorMap[name] = authorMap[name] || []).push(b);
  }
  const eraMap = {};
  for (const b of catalog) { const e = b.era || 'غير محدد'; (eraMap[e] = eraMap[e] || []).push(b); }
  write('authors/index.html', authorsIndex(authorMap));
  for (const [name, list] of Object.entries(authorMap)) write(`author/${authorSlug(list[0])}/index.html`, authorPage(name, list));

  let texts = 0, missing = 0;
  const sitemapPaths = ['', 'library/', 'stats/', 'about/', 'rights/', 'contact/', 'privacy/'];
  for (const b of catalog) {
    let chapterTitles = [];
    const textPath = path.join(DATA, 'texts', b.id + '.json');
    if (fs.existsSync(textPath)) {
      try {
        const text = JSON.parse(fs.readFileSync(textPath, 'utf8'));
        chapterTitles = (text.chapters || []).map((c) => (c.title && (c.title.ar || c.title.en)) || '').filter(Boolean);
        fs.mkdirSync(path.join(DIST, 'books'), { recursive: true });
        fs.copyFileSync(textPath, path.join(DIST, 'books', b.id + '.json'));
        texts++;
      } catch (e) { log('⚠ bad text json: ' + b.id + ' — ' + e.message); }
    } else { missing++; log('⚠ no text for ' + b.id); }

    write(`book/${b.id}/index.html`, bookPage(b, catalog, chapterTitles));
    write(`read/${b.id}/index.html`, readerShell(b));
    sitemapPaths.push(`book/${b.id}/`, `read/${b.id}/`);
  }
  sitemapPaths.push('authors/');
  for (const [name, list] of Object.entries(authorMap)) sitemapPaths.push(`author/${authorSlug(list[0])}/`);

  write('sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...new Set(sitemapPaths)].map((p) => `  <url><loc>${SITE_URL}/${p}</loc><lastmod>${BUILD_DATE.slice(0, 10)}</lastmod></url>`).join('\n') +
    '\n</urlset>');
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  // assets
  fs.cpSync(path.join(SITE, 'assets'), path.join(DIST, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'assets', 'sw.js'), SW_JS);
  for (const dir of ['fonts', 'icons']) {
    const from = path.join(ROOT, '..', 'reading-app-mvp', dir);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(DIST, dir), { recursive: true });
  }
  // client search index
  const indexFile = path.join(DATA, 'index.json');
  if (fs.existsSync(indexFile)) {
    fs.copyFileSync(indexFile, path.join(DIST, 'books-index.json'));
  } else {
    log('⚠ books-data/index.json missing — run `npm run books:index` first');
  }

  const pages = 6 + 2 + catalog.length * 2;
  log(`site built: ${pages} HTML pages, ${texts} book texts (${missing} missing), ${catalog.length} books → site/dist/`);
})();
