/* Qirtas — app logic: i18n, library, paginated reader (RTL/LTR), progress, mock ads, PWA */
'use strict';

/* ================= i18n ================= */
const STR = {
  ar: {
    brand: 'قِرطاس',
    tagline: 'اقرأ أينما كنت',
    install: 'ثبّت التطبيق',
    libraryTitle: 'المكتبة',
    librarySub: 'كتب من الملكية العامة — مجانية بالكامل',
    searchPh: 'ابحث عن كتاب أو مؤلف…',
    noResults: 'لا توجد نتائج مطابقة',
    continue: 'متابعة القراءة',
    resume: 'متابعة',
    prevChapter: 'الفصل السابق',
    nextChapter: 'الفصل التالي',
    toc: 'الفهرس',
    back: 'رجوع',
    theme: 'الوضع الليلي/النهاري',
    fontPlus: 'تكبير الخط',
    fontMinus: 'تصغير الخط',
    resumedTo: (p) => `استأنفتُ القراءة من الصفحة ${p}`,
    saved: 'حُفظ موضع القراءة',
    adBanner: 'مساحة إعلانية تجريبية — AdMob Banner هنا في النسخة النهائية',
    adInterTitle: 'مساحة إعلانية تجريبية',
    adInterSub: 'هنا سيظهر إعلان AdMob بيني (Interstitial) بين الفصول في الإصدار النهائي',
    closeIn: (n) => `إغلاق (${n})`,
    close: 'إغلاق الإعلان',
    page: 'صفحة',
  },
  en: {
    brand: 'Qirtas',
    tagline: 'Read anywhere',
    install: 'Install app',
    libraryTitle: 'Library',
    librarySub: 'Public-domain books — completely free',
    searchPh: 'Search by title or author…',
    noResults: 'No matching results',
    continue: 'Continue reading',
    resume: 'Resume',
    prevChapter: 'Previous chapter',
    nextChapter: 'Next chapter',
    toc: 'Contents',
    back: 'Back',
    theme: 'Dark/light mode',
    fontPlus: 'Increase font size',
    fontMinus: 'Decrease font size',
    resumedTo: (p) => `Resumed from page ${p}`,
    saved: 'Reading position saved',
    adBanner: 'Mock ad space — AdMob banner goes here in production',
    adInterTitle: 'Mock ad space',
    adInterSub: 'An AdMob interstitial will appear here between chapters in production',
    closeIn: (n) => `Close (${n})`,
    close: 'Close ad',
    page: 'Page',
  },
};

/* ================= state ================= */
const LS = {
  lang: 'qirtas.lang',
  theme: 'qirtas.theme',
  fs: 'qirtas.fontScale',
  progress: 'qirtas.progress',
};

const state = {
  lang: localStorage.getItem(LS.lang) || 'ar',
  theme: localStorage.getItem(LS.theme) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  fontScale: parseFloat(localStorage.getItem(LS.fs)) || 1,
  activeCat: 'all',
  query: '',
  book: null,
  chapter: 0,
  page: 0,
  pages: 1,
  deferredPrompt: null,
};

const $ = (id) => document.getElementById(id);
const els = {};
['brandBtn','installBtn','langBtn','langBtnLabel','themeBtn','themeIcon',
 'viewLibrary','continueCard','continueTitle','continueMeta','continueBtn',
 'libraryTitle','searchInput','chips','bookGrid','emptyMsg',
 'viewReader','backBtn','readerBookTitle','readerChapterTitle','fontMinus','fontPlus','tocBtn',
 'readerContent','prevPage','nextPage','prevChapter','nextChapter',
 'progressFill','pageIndicator','adBannerText','tocOverlay','tocClose','tocList',
 'interstitial','interstitialClose','toast'].forEach((k) => (els[k] = $(k)));

const isRTL = () => state.lang === 'ar';

/* ================= helpers ================= */
function saveLS(key, val) { try { localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); } catch (e) {} }
function loadProgress() { try { return JSON.parse(localStorage.getItem(LS.progress) || '{}'); } catch (e) { return {}; } }

let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2200);
}

/* ================= theme & lang ================= */
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  els.themeIcon.textContent = state.theme === 'dark' ? '☀️' : '🌙';
  saveLS(LS.theme, state.theme);
}

function applyLang() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
  els.langBtnLabel.textContent = state.lang === 'ar' ? 'EN' : 'ع';
  document.querySelectorAll('[data-i]').forEach((el) => {
    const key = el.dataset.i;
    const val = STR[state.lang][key];
    if (typeof val === 'string') el.textContent = val;
  });
  document.querySelectorAll('[data-i-ph]').forEach((el) => {
    el.placeholder = STR[state.lang][el.dataset.iPh];
  });
  document.querySelectorAll('[data-i-title]').forEach((el) => {
    el.title = STR[state.lang][el.dataset.iTitle];
  });
  els.adBannerText.textContent = STR[state.lang].adBanner;
  saveLS(LS.lang, state.lang);
}

/* ================= library ================= */
function bookCardHTML(b) {
  return `
  <article class="book-card" data-book="${b.id}" role="button" tabindex="0" aria-label="${b.title[state.lang]}">
    <div class="cover ${b.grad}">
      <span class="cov-title">${b.title[state.lang]}</span>
      <span class="cov-author">${b.author[state.lang]}</span>
      <span class="cov-orn">${b.emoji}</span>
    </div>
    <div class="book-meta">
      <strong>${b.title[state.lang]}</strong>
      <span>${b.author[state.lang]} · ${b.year}</span>
    </div>
  </article>`;
}

function renderChips() {
  els.chips.innerHTML = CATEGORIES.map(
    (c) => `<button class="chip ${state.activeCat === c.id ? 'active' : ''}" data-cat="${c.id}">${c[state.lang]}</button>`
  ).join('');
}

function renderLibrary() {
  const q = state.query.trim().toLowerCase();
  const list = BOOKS.filter((b) => {
    const inCat = state.activeCat === 'all' || b.cat === state.activeCat;
    const inQ =
      !q ||
      b.title.ar.toLowerCase().includes(q) || b.title.en.toLowerCase().includes(q) ||
      b.author.ar.toLowerCase().includes(q) || b.author.en.toLowerCase().includes(q);
    return inCat && inQ;
  });
  const sig = state.query + '|' + state.activeCat;
  if (state._sig !== sig) { state._sig = sig; state.limit = 60; }
  if (!state.limit) state.limit = 60;
  const shown = list.slice(0, state.limit);
  els.bookGrid.innerHTML =
    shown.map(bookCardHTML).join('') +
    (list.length > shown.length
      ? '<button class="btn btn-ghost" id="loadMore" style="grid-column:1/-1;margin:16px auto;min-width:220px">' +
        (state.lang === 'ar' ? 'عرض المزيد' : 'Show more') + ' (' + (list.length - shown.length) + ')</button>'
      : '');
  const lm = document.getElementById('loadMore');
  if (lm) lm.addEventListener('click', () => { state.limit += 60; renderLibrary(); });
  els.emptyMsg.classList.toggle('hidden', list.length > 0);
  renderChips();
  renderContinueCard();
}

function renderContinueCard() {
  const prog = loadProgress();
  const entries = Object.entries(prog).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
  if (!entries.length) { els.continueCard.classList.add('hidden'); return; }
  const [bookId, p] = entries[0];
  const b = BOOKS.find((x) => x.id === bookId);
  if (!b) { els.continueCard.classList.add('hidden'); return; }
  const chTitle = (b.chapters && b.chapters[p.ch] && b.chapters[p.ch].title) || {
    ar: 'الفصل ' + (p.ch + 1), en: 'Chapter ' + (p.ch + 1),
  };
  els.continueTitle.textContent = b.title[state.lang];
  els.continueMeta.textContent = `${chTitle[state.lang]} · ${STR[state.lang].page} ${p.page + 1}`;
  els.continueCard.classList.remove('hidden');
}

/* ================= reader & pagination ================= */
let step = 0;

function measure() {
  const el = els.readerContent;
  const cs = getComputedStyle(el);
  const pl = parseFloat(cs.paddingLeft) || 0;
  const pr = parseFloat(cs.paddingRight) || 0;
  const inner = el.clientWidth - pl - pr;
  // Column width = visible content width. The gap swallows both page paddings
  // plus breathing room, so off-screen columns sit fully outside the clip box.
  const gap = pl + pr + 56;
  if (el.style.columnWidth !== inner + 'px') el.style.columnWidth = inner + 'px';
  const gapStr = gap + 'px';
  if (el.style.columnGap !== gapStr) el.style.columnGap = gapStr;
  step = inner + gap;
  const overflow = el.scrollWidth - el.clientWidth;
  state.pages = overflow <= 4 ? 1 : Math.max(1, Math.round(overflow / step) + 1);
}

let animId = 0;

function animateScrollTo(target, instant) {
  const el = els.readerContent;
  cancelAnimationFrame(animId);
  el.style.scrollBehavior = 'auto'; // engine smooth-scroll is unreliable for RTL columns
  const from = el.scrollLeft;
  const delta = target - from;
  if (instant || Math.abs(delta) < 2) { el.scrollLeft = target; return; }
  const dur = 260;
  const t0 = performance.now();
  let last = t0;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const tick = (now) => {
    if (now - last > 120) { el.scrollLeft = target; return; } // starved frames → snap
    last = now;
    const t = Math.min(1, (now - t0) / dur);
    el.scrollLeft = from + delta * ease(t);
    if (t < 1) animId = requestAnimationFrame(tick);
  };
  animId = requestAnimationFrame(tick);
  // rAF can stay frozen in background/occluded tabs — guarantee we land on target
  setTimeout(() => {
    if (Math.abs(el.scrollLeft - target) > 2) {
      cancelAnimationFrame(animId);
      el.scrollLeft = target;
    }
  }, 400);
}

function goToPage(p, instant) {
  measure();
  state.page = Math.min(Math.max(0, p), state.pages - 1);
  const target = state.page * step;
  animateScrollTo(isReaderRTL() ? -target : target, instant);
  els.pageIndicator.textContent = `${state.page + 1} / ${state.pages}`;
  els.progressFill.style.width = `${state.pages > 1 ? (state.page / (state.pages - 1)) * 100 : 100}%`;
  els.prevPage.style.visibility = state.page === 0 ? 'hidden' : 'visible';
  els.nextPage.style.visibility = state.page === state.pages - 1 ? 'hidden' : 'visible';
  saveProgressDebounced();
}

const isReaderRTL = () => els.readerContent.dir === 'rtl';

function currentPageFromScroll() {
  const sl = Math.abs(els.readerContent.scrollLeft);
  return step ? Math.round(sl / step) : 0;
}

function saveProgress() {
  if (!state.book) return;
  const prog = loadProgress();
  prog[state.book.id] = { ch: state.chapter, page: state.page, ts: Date.now() };
  saveLS(LS.progress, prog);
  renderContinueCard();
}
const saveProgressDebounced = (() => {
  let t;
  return () => { clearTimeout(t); t = setTimeout(saveProgress, 400); };
})();

function renderChapter(idx, page = 0, announce) {
  const b = state.book;
  const ch = b.chapters[idx];
  state.chapter = idx;
  els.readerBookTitle.textContent = b.title[state.lang];
  els.readerChapterTitle.textContent = ch.title[state.lang];
  const el = els.readerContent;
  el.dir = b.cat === 'arabic' ? 'rtl' : 'ltr';
  el.innerHTML =
    `<div class="chap-num">${b.cat === 'arabic' ? 'الفصل ' + (idx + 1) : 'CHAPTER ' + (idx + 1)}</div>` +
    `<h2 class="chap-title">${ch.title[state.lang]}</h2>` +
    ch.paragraphs.map((p) => `<p>${p}</p>`).join('');
  els.fontScaleApply && els.fontScaleApply();
  goToPage(page, true);
  els.prevChapter.disabled = idx === 0;
  els.nextChapter.disabled = idx === b.chapters.length - 1;
  if (announce) toast(announce);
}

async function openReader(bookId, ch = 0, page = 0) {
  state.book = BOOKS.find((b) => b.id === bookId);
  if (!state.book) return;
  els.viewLibrary.classList.add('hidden');
  els.viewReader.classList.remove('hidden');
  els.viewReader.scrollTop = 0;
  const ok = await ensureBookText(state.book);
  if (!ok) return;
  renderChapter(ch, page);
}

/* Lazily fetch a book's text (offline-cached by the service worker). */
async function ensureBookText(book) {
  if (book.chapters && book.chapters.length) return true;
  els.readerContent.innerHTML = '<div class="loading">' + STR[state.lang].loading + '</div>';
  try {
    const res = await fetch('./books/' + encodeURIComponent(book.id) + '.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.json();
    if (!text.chapters || !text.chapters.length) throw new Error('empty');
    book.chapters = text.chapters;
    return true;
  } catch (err) {
    els.readerContent.innerHTML =
      '<div class="loading">' +
      (state.lang === 'ar'
        ? 'تعذّر تحميل نص هذا الكتاب — تحقق من الاتصال ثم أعد المحاولة.'
        : 'Could not load this book text — check your connection and try again.') +
      '</div>';
    return false;
  }
}

function closeReader() {
  state.book = null;
  els.viewReader.classList.add('hidden');
  els.viewLibrary.classList.remove('hidden');
  renderLibrary();
}

function nextPage() {
  if (state.page < state.pages - 1) goToPage(state.page + 1);
}
function prevPage() {
  if (state.page > 0) goToPage(state.page - 1);
}
function switchChapter(delta) {
  const target = state.chapter + delta;
  if (target < 0 || target >= state.book.chapters.length) return;
  if (delta > 0) showInterstitial(() => renderChapter(target, 0));
  else renderChapter(target, 0);
}

/* font scale */
function applyFontScale() {
  els.readerContent.style.setProperty('--fscale', state.fontScale);
  if (state.book) {
    const ratio = state.pages > 1 ? state.page / (state.pages - 1) : 0;
    measure();
    goToPage(Math.round(ratio * Math.max(0, state.pages - 1)), true);
  }
}
els.fontScaleApply = applyFontScale;

/* ================= toc ================= */
function openToc() {
  els.tocList.innerHTML = state.book.chapters
    .map(
      (c, i) =>
        `<li><button data-ch="${i}"><span class="toc-num">${i + 1}</span><span>${c.title[state.lang]}</span></button></li>`
    )
    .join('');
  els.tocOverlay.classList.remove('hidden');
}
function closeToc() { els.tocOverlay.classList.add('hidden'); }

/* ================= mock ads ================= */
function showInterstitial(onClose) {
  const ov = els.interstitial;
  const btn = els.interstitialClose;
  ov.classList.remove('hidden');
  let n = 5;
  btn.disabled = true;
  btn.textContent = STR[state.lang].closeIn(n);
  const t = setInterval(() => {
    n -= 1;
    if (n > 0) btn.textContent = STR[state.lang].closeIn(n);
    else {
      clearInterval(t);
      btn.disabled = false;
      btn.textContent = STR[state.lang].close;
    }
  }, 700);
  btn.onclick = () => {
    clearInterval(t);
    ov.classList.add('hidden');
    onClose && onClose();
  };
}

const AD_ROTATION = [
  '📚 إعلان تجريبي: ناشر كتابك الإلكتروني مجاناً — Mock Ad',
  '☕ إعلان تجريبي: اشترك في نادي القهوة الأدبي — Mock Ad',
  '🎧 إعلان تجريبي: كتاب صوتي جديد كل أسبوع — Mock Ad',
];
let adIdx = 0;
setInterval(() => {
  adIdx = (adIdx + 1) % AD_ROTATION.length;
  els.adBannerText.textContent = AD_ROTATION[adIdx];
}, 12000);

/* ================= events ================= */
els.brandBtn.addEventListener('click', () => {
  if (!els.viewReader.classList.contains('hidden')) closeReader();
  els.viewLibrary.scrollTo({ top: 0, behavior: 'smooth' });
});

els.bookGrid.addEventListener('click', (e) => {
  const card = e.target.closest('[data-book]');
  if (card) {
    const prog = loadProgress()[card.dataset.book];
    if (prog && prog.ch < 99) {
      openReader(card.dataset.book, prog.ch, prog.page);
      toast(STR[state.lang].resumedTo(prog.page + 1));
    } else openReader(card.dataset.book);
  }
});
els.bookGrid.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-book]')) {
    e.preventDefault();
    e.target.closest('[data-book]').click();
  }
});

els.chips.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-cat]');
  if (chip) { state.activeCat = chip.dataset.cat; renderLibrary(); }
});

els.searchInput.addEventListener('input', (e) => { state.query = e.target.value; renderLibrary(); });
els.continueBtn.addEventListener('click', () => {
  const entries = Object.entries(loadProgress()).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
  if (entries.length) { const [id, p] = entries[0]; openReader(id, p.ch, p.page); }
});

els.backBtn.addEventListener('click', closeReader);
els.tocBtn.addEventListener('click', openToc);
els.tocClose.addEventListener('click', closeToc);
els.tocOverlay.addEventListener('click', (e) => { if (e.target === els.tocOverlay) closeToc(); });
els.tocList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-ch]');
  if (btn) { closeToc(); renderChapter(Number(btn.dataset.ch), 0); }
});

els.prevPage.addEventListener('click', prevPage);
els.nextPage.addEventListener('click', nextPage);
els.prevChapter.addEventListener('click', () => switchChapter(-1));
els.nextChapter.addEventListener('click', () => switchChapter(1));

els.fontPlus.addEventListener('click', () => {
  state.fontScale = Math.min(1.6, +(state.fontScale + 0.1).toFixed(2));
  saveLS(LS.fs, String(state.fontScale));
  applyFontScale();
});
els.fontMinus.addEventListener('click', () => {
  state.fontScale = Math.max(0.8, +(state.fontScale - 0.1).toFixed(2));
  saveLS(LS.fs, String(state.fontScale));
  applyFontScale();
});

els.themeBtn.addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
});
els.langBtn.addEventListener('click', () => {
  state.lang = state.lang === 'ar' ? 'en' : 'ar';
  applyLang();
  renderLibrary();
  if (state.book) {
    els.readerBookTitle.textContent = state.book.title[state.lang];
    els.readerChapterTitle.textContent = state.book.chapters[state.chapter].title[state.lang];
  }
});

/* keyboard */
document.addEventListener('keydown', (e) => {
  if (!els.viewReader.classList.contains('hidden') && els.interstitial.classList.contains('hidden')) {
    const fwd = isReaderRTL() ? 'ArrowLeft' : 'ArrowRight';
    const back = isReaderRTL() ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === fwd) nextPage();
    else if (e.key === back) prevPage();
    else if (e.key === 'Escape') closeReader();
  }
  if (e.key === 'Escape') { closeToc(); if (!els.interstitial.classList.contains('hidden')) els.interstitialClose.click(); }
});

/* swipe */
let touchX = null;
els.readerContent.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
els.readerContent.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 45) { dx < 0 ? nextPage() : prevPage(); }
  touchX = null;
}, { passive: true });

/* keep pagination stable on resize */
let resizeT;
addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { if (state.book) goToPage(state.page, true); }, 150);
});

/* ================= PWA ================= */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.deferredPrompt = e;
  els.installBtn.classList.remove('hidden');
  showInstallBanner('prompt');
});
els.installBtn.addEventListener('click', async () => {
  if (!state.deferredPrompt) return;
  state.deferredPrompt.prompt();
  await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
  els.installBtn.classList.add('hidden');
});
addEventListener('appinstalled', () => {
  els.installBtn.classList.add('hidden');
  hideInstallBanner();
});

/* install banner (Android prompt / iOS manual hint) */
const elsBanner = {
  root: $('installBanner'), title: $('ibTitle'), sub: $('ibSub'),
  install: $('ibInstall'), close: $('ibClose'),
};
const DISMISS_KEY = 'qirtas.installDismissedAt';
const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function showInstallBanner(mode) {
  if (STANDALONE) return;
  const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
  if (Date.now() - dismissed < 3 * 24 * 60 * 60 * 1000) return; // 3 days
  const t = STR[state.lang];
  if (mode === 'ios') {
    elsBanner.title.textContent = state.lang === 'ar' ? 'أضِف قِرطاس إلى شاشتك الرئيسية' : 'Add Qirtas to your Home Screen';
    elsBanner.sub.textContent = state.lang === 'ar'
      ? 'من زر المشاركة في سفاري اختر «إضافة إلى الشاشة الرئيسية»'
      : 'In Safari, tap Share then “Add to Home Screen”';
    elsBanner.install.classList.add('hidden');
    elsBanner.close.textContent = state.lang === 'ar' ? 'فهمت' : 'Got it';
  } else {
    elsBanner.title.textContent = state.lang === 'ar' ? 'ثبّت قِرطاس على جهازك' : 'Install Qirtas on your device';
    elsBanner.sub.textContent = state.lang === 'ar'
      ? 'تثبيت سريع — يعمل بلا إنترنت وبملء الشاشة'
      : 'Quick install — works offline, full screen';
    elsBanner.install.classList.remove('hidden');
    elsBanner.install.textContent = state.lang === 'ar' ? 'تثبيت' : 'Install';
    elsBanner.close.textContent = '✕';
  }
  elsBanner.root.classList.remove('hidden');
}
function hideInstallBanner() { elsBanner.root.classList.add('hidden'); }

elsBanner.install.addEventListener('click', async () => {
  if (!state.deferredPrompt) return;
  state.deferredPrompt.prompt();
  const choice = await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
  if (choice && choice.outcome === 'accepted') hideInstallBanner();
});
elsBanner.close.addEventListener('click', () => {
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
  hideInstallBanner();
});
// iOS Safari: no beforeinstallprompt — show manual hint after a short delay
const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (IS_IOS) setTimeout(() => showInstallBanner('ios'), 4000);

/* ================= boot ================= */
applyTheme();
applyLang();
renderLibrary();
// fonts finishing after first layout can change pagination — correct once ready
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => { if (state.book) goToPage(state.page, true); });
}
