/* Qirtas web reader — paginated engine with RTL/LTR support.
   Adapted from the MVP: column pagination, rAF tween + landing guarantee,
   progress persistence, i18n, themes, TOC, interstitial mock slot. */
'use strict';

const STR = {
  ar: {
    back: 'الرئيسية', toc: 'الفهرس', prevChapter: 'الفصل السابق', nextChapter: 'الفصل التالي',
    resumedTo: (p) => `استأنفتُ القراءة من الصفحة ${p}`, loading: 'جارٍ تحميل الكتاب…',
    adBanner: 'مساحة إعلانية تجريبية — AdSense هنا في النسخة النهائية',
    adInterTitle: 'مساحة إعلانية تجريبية', adInterSub: 'هنا سيظهر إعلان AdMob/AdSense بيني بين الفصول',
    closeIn: (n) => `إغلاق (${n})`, close: 'إغلاق الإعلان', chapter: 'الفصل', page: 'صفحة',
  },
  en: {
    back: 'Home', toc: 'Contents', prevChapter: 'Previous chapter', nextChapter: 'Next chapter',
    resumedTo: (p) => `Resumed from page ${p}`, loading: 'Loading book…',
    adBanner: 'Mock ad space — AdSense goes here in production',
    adInterTitle: 'Mock ad space', adInterSub: 'An interstitial ad appears here between chapters',
    closeIn: (n) => `Close (${n})`, close: 'Close ad', chapter: 'Chapter', page: 'Page',
  },
};

const state = {
  lang: localStorage.getItem('q.lang') || 'ar',
  theme: localStorage.getItem('q.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  fontScale: parseFloat(localStorage.getItem('q.fs')) || 1,
  id: decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || ''),
  book: null, text: null, chapter: 0, page: 0, pages: 1,
};
const $ = (s) => document.querySelector(s);
const els = {
  bookTitle: $('#rBookTitle'), chapTitle: $('#rChapTitle'), content: $('#readerContent'),
  indicator: $('#pageIndicator'), fill: $('#progressFill'), prev: $('#prevPage'), next: $('#nextPage'),
  prevCh: $('#prevChapter'), nextCh: $('#nextChapter'), toast: $('#toast'),
  tocOverlay: $('#tocOverlay'), tocList: $('#tocList'),
  inter: $('#interstitial'), interClose: $('#interstitialClose'), adText: $('#adBannerText'),
};

let step = 0, animId = 0;

/* ---------- theme / lang ---------- */
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  $('#themeBtn').textContent = state.theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('q.theme', state.theme);
}
function applyLang() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  $('#langBtn').textContent = state.lang === 'ar' ? 'EN' : 'ع';
  els.adText.textContent = STR[state.lang].adBanner;
  $('#backLink').title = STR[state.lang].back;
  localStorage.setItem('q.lang', state.lang);
}

/* ---------- pagination ---------- */
function measure() {
  const el = els.content;
  const cs = getComputedStyle(el);
  const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
  const inner = el.clientWidth - pl - pr;
  const gap = pl + pr + 56;
  if (el.style.columnWidth !== inner + 'px') el.style.columnWidth = inner + 'px';
  if (el.style.columnGap !== gap + 'px') el.style.columnGap = gap + 'px';
  step = inner + gap;
  const overflow = el.scrollWidth - el.clientWidth;
  state.pages = overflow <= 4 ? 1 : Math.max(1, Math.round(overflow / step) + 1);
}
function animateScrollTo(target, instant) {
  const el = els.content;
  cancelAnimationFrame(animId);
  el.style.scrollBehavior = 'auto';
  const from = el.scrollLeft, delta = target - from;
  if (instant || Math.abs(delta) < 2) { el.scrollLeft = target; return; }
  const dur = 260, t0 = performance.now();
  let last = t0;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const tick = (now) => {
    if (now - last > 120) { el.scrollLeft = target; return; }
    last = now;
    const t = Math.min(1, (now - t0) / dur);
    el.scrollLeft = from + delta * ease(t);
    if (t < 1) animId = requestAnimationFrame(tick);
  };
  animId = requestAnimationFrame(tick);
  setTimeout(() => { if (Math.abs(el.scrollLeft - target) > 2) { cancelAnimationFrame(animId); el.scrollLeft = target; } }, 400);
}
const isReaderRTL = () => els.content.dir === 'rtl';
function goToPage(p, instant) {
  measure();
  state.page = Math.min(Math.max(0, p), state.pages - 1);
  const target = state.page * step;
  animateScrollTo(isReaderRTL() ? -target : target, instant);
  els.indicator.textContent = `${state.page + 1} / ${state.pages}`;
  els.fill.style.width = `${state.pages > 1 ? (state.page / (state.pages - 1)) * 100 : 100}%`;
  els.prev.style.visibility = state.page === 0 ? 'hidden' : 'visible';
  els.next.style.visibility = state.page === state.pages - 1 ? 'hidden' : 'visible';
  saveProgress();
}
function saveProgress() {
  if (!state.book) return;
  const all = JSON.parse(localStorage.getItem('q.progress') || '{}');
  all[state.id] = { ch: state.chapter, page: state.page, ts: Date.now(), title: state.book.title, chapterTitle: state.text.chapters[state.chapter]?.title };
  try { localStorage.setItem('q.progress', JSON.stringify(all)); } catch (e) {}
}

/* ---------- rendering ---------- */
function renderChapter(idx, page = 0, announce) {
  const ch = state.text.chapters[idx];
  state.chapter = idx;
  els.bookTitle.textContent = state.book.title[state.lang] || state.book.title.ar;
  els.chapTitle.textContent = ch.title[state.lang] || ch.title.ar;
  const el = els.content;
  el.dir = state.book.lang === 'ar' ? 'rtl' : 'ltr';
  const num = state.book.lang === 'ar' ? 'الفصل ' + (idx + 1) : (state.chapter + 1);
  el.innerHTML =
    `<div class="chap-num">${num}</div><h2 class="chap-title">${ch.title.ar}</h2>` +
    ch.paragraphs.map((p) => `<p>${p}</p>`).join('');
  goToPage(page, true);
  els.prevCh.disabled = idx === 0;
  els.nextCh.disabled = idx === state.text.chapters.length - 1;
  if (announce) toast(announce);
}
function openChapter(delta) {
  const t = state.chapter + delta;
  if (t < 0 || t >= state.text.chapters.length) return;
  if (delta > 0) showInterstitial(() => renderChapter(t, 0));
  else renderChapter(t, 0);
}
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.add('hidden'), 2200);
}

/* ---------- toc ---------- */
function openToc() {
  els.tocList.innerHTML = state.text.chapters
    .map((c, i) => `<li><button data-ch="${i}"><span class="n">${i + 1}</span><span>${c.title.ar}</span></button></li>`).join('');
  els.tocOverlay.classList.remove('hidden');
}
function closeToc() { els.tocOverlay.classList.add('hidden'); }

/* ---------- interstitial (mock slot) ---------- */
function showInterstitial(onClose) {
  els.inter.classList.remove('hidden');
  const btn = els.interClose;
  btn.disabled = true;
  $('#interTitle').textContent = STR[state.lang].adInterTitle;
  $('#interSub').textContent = STR[state.lang].adInterSub;
  let n = 5;
  btn.textContent = STR[state.lang].closeIn(n);
  const t = setInterval(() => {
    n -= 1;
    if (n > 0) btn.textContent = STR[state.lang].closeIn(n);
    else { clearInterval(t); btn.disabled = false; btn.textContent = STR[state.lang].close; }
  }, 700);
  btn.onclick = () => { clearInterval(t); els.inter.classList.add('hidden'); onClose && onClose(); };
}

/* ---------- events ---------- */
$('#themeBtn').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; applyTheme(); });
$('#langBtn').addEventListener('click', () => {
  state.lang = state.lang === 'ar' ? 'en' : 'ar';
  applyLang();
  renderChapter(state.chapter, state.page);
});
$('#fontPlus').addEventListener('click', () => { state.fontScale = Math.min(1.6, +(state.fontScale + 0.1).toFixed(2)); localStorage.setItem('q.fs', state.fontScale); els.content.style.setProperty('--fscale', state.fontScale); if (state.text) goToPage(state.page, true); });
$('#fontMinus').addEventListener('click', () => { state.fontScale = Math.max(0.8, +(state.fontScale - 0.1).toFixed(2)); localStorage.setItem('q.fs', state.fontScale); els.content.style.setProperty('--fscale', state.fontScale); if (state.text) goToPage(state.page, true); });
$('#tocBtn').addEventListener('click', openToc);
$('#tocClose').addEventListener('click', closeToc);
els.tocOverlay.addEventListener('click', (e) => { if (e.target === els.tocOverlay) closeToc(); });
els.tocList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-ch]');
  if (btn) { closeToc(); renderChapter(Number(btn.dataset.ch), 0); }
});
els.prev.addEventListener('click', () => goToPage(state.page - 1));
els.next.addEventListener('click', () => goToPage(state.page + 1));
els.prevCh.addEventListener('click', () => openChapter(-1));
els.nextCh.addEventListener('click', () => openChapter(1));
document.addEventListener('keydown', (e) => {
  if (els.tocOverlay.classList.contains('hidden') && els.inter.classList.contains('hidden')) {
    const fwd = isReaderRTL() ? 'ArrowLeft' : 'ArrowRight';
    const back = isReaderRTL() ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === fwd) goToPage(state.page + 1);
    else if (e.key === back) goToPage(state.page - 1);
  }
  if (e.key === 'Escape') closeToc();
});
let touchX = null;
els.content.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
els.content.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 45) dx < 0 ? goToPage(state.page + 1) : goToPage(state.page - 1);
  touchX = null;
}, { passive: true });
let resizeT;
addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (state.text) goToPage(state.page, true); }, 150); });

/* ---------- boot ---------- */
(async function boot() {
  applyTheme();
  applyLang();
  els.content.innerHTML = `<div class="loading">${STR[state.lang].loading}</div>`;
  els.content.style.setProperty('--fscale', state.fontScale);
  try {
    const [metaRes, textRes] = await Promise.all([
      fetch('/catalog.json').then((r) => r.json()),
      fetch(`/books/${state.id}.json`).then((r) => r.json()),
    ]);
    state.book = metaRes.find((b) => b.id === state.id) || { title: { ar: state.id, en: state.id }, lang: textRes.chapters?.[0]?.paragraphs?.[0]?.match(/[\u0600-\u06FF]/) ? 'ar' : 'en' };
    state.text = textRes;
    document.title = `${state.book.title.ar} — قِرطاس`;
    const chParam = Number(new URLSearchParams(location.search).get('ch'));
    let startCh = Number.isInteger(chParam) && chParam >= 1 && chParam <= textRes.chapters.length ? chParam - 1 : 0;
    let startPage = 0, resumed = false;
    const all = JSON.parse(localStorage.getItem('q.progress') || '{}');
    const saved = all[state.id];
    if (!chParam && saved && saved.ch < textRes.chapters.length) {
      startCh = saved.ch; startPage = saved.page || 0; resumed = true;
    }
    renderChapter(startCh, startPage, resumed ? STR[state.lang].resumedTo(startPage + 1) : undefined);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (state.text) goToPage(state.page, true); });
  } catch (e) {
    showFatal(e);
  }
})();

function showFatal(e) {
  const msg = (e && e.message) || String(e || 'unknown');
  const is404 = /404|Unexpected token|JSON/.test(msg);
  els.content.innerHTML =
    '<div class="reader-fatal">' +
      '<div class="emoji">' + (is404 ? '📕' : '📡') + '</div>' +
      '<h3>' + (is404 ? 'نص هذا الكتاب غير متوفر حالياً' : 'تعذّر تحميل الكتاب') + '</h3>' +
      '<p>' + (is404
        ? 'قد يكون النص قد أُزيل مؤقتاً أو الرابط قديم. جرّب التحديث، أو اقرأه من المصدر الأصلي من صفحة الكتاب.'
        : 'تحقق من اتصالك بالإنترنت ثم أعد المحاولة. موضع قراءتك محفوظ تلقائياً.') + '</p>' +
      '<div class="fatal-actions">' +
        '<button class="btn btn-accent" id="readerRetry">إعادة المحاولة</button>' +
        '<a class="btn btn-ghost" href="/book/' + encodeURIComponent(state.id) + '/">صفحة الكتاب</a>' +
        '<a class="btn btn-ghost" href="/library/">المكتبة</a>' +
      '</div>' +
    '</div>';
  const btn = document.getElementById('readerRetry');
  if (btn) btn.addEventListener('click', function () { btn.disabled = true; btn.textContent = 'جارٍ المحاولة…'; location.reload(); });
}

/* ================= reading-first layer (added) ================= */
(function () {
  const M = matchMedia('(pointer: coarse)').matches;
  const W = Math.min(screen.width, innerWidth);

  // 1) per-device default type size, only when the reader has no saved preference
  if (!localStorage.getItem('q.fs')) {
    const base = W < 520 ? 1.0 : W < 900 ? 1.08 : 1.14;
    state.fontScale = base;
    els.content.style.setProperty('--fscale', base);
    localStorage.setItem('q.fs', base);
  }

  // 2) reading-font switch (naskh <-> system) — helps e-readers and small screens
  const fontBtn = document.getElementById('fontMode');
  const applyFont = (mode) => {
    document.documentElement.dataset.readingFont = mode;
    localStorage.setItem('q.rfont', mode);
    if (fontBtn) fontBtn.textContent = mode === 'system' ? 'خط: النظام' : 'خط: نسخ';
  };
  applyFont(localStorage.getItem('q.rfont') || 'naskh');
  if (fontBtn) {
    fontBtn.addEventListener('click', () => {
      applyFont((localStorage.getItem('q.rfont') || 'naskh') === 'naskh' ? 'system' : 'naskh');
      if (state.text) goToPage(state.page, true);
    });
  }

  // 3) tap zones: left third = forward in RTL context, right third = back
  const stage = document.querySelector('.reader-stage');
  if (stage && M) {
    let x0 = null, t0 = 0;
    stage.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; t0 = Date.now(); }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dt = Date.now() - t0;
      if (Math.abs(dx) < 12 && dt < 350) {
        const rect = stage.getBoundingClientRect();
        const rel = (e.changedTouches[0].clientX - rect.left) / rect.width;
        if (rel < 0.3) isReaderRTL() ? goToPage(state.page + 1) : goToPage(state.page - 1);
        else if (rel > 0.7) isReaderRTL() ? goToPage(state.page - 1) : goToPage(state.page + 1);
      }
      x0 = null;
    }, { passive: true });
  }

  // 4) download EPUB + print (save as PDF) + keyboard shortcuts
  const epub = document.getElementById('btnEpub');
  if (epub) epHref(state.id);
  function epHref(id) {
    const a = document.getElementById('btnEpub');
    if (a) a.href = '/api/book/' + encodeURIComponent(id) + '.epub';
  }
  const pr = document.getElementById('btnPrint');
  if (pr) pr.addEventListener('click', () => window.print());

  addEventListener('keydown', (e) => {
    if (e.key === 'f' && !e.metaKey && !e.ctrlKey) { const b = document.getElementById('fontMode'); if (b) b.click(); }
    if (e.key === 'd' && !e.metaKey && !e.ctrlKey) { const a = document.getElementById('btnEpub'); if (a) a.click(); }
  });

  // 5) rights + source footer inside the reader (always reachable while reading)
  const bottom = document.querySelector('.reader-bottom');
  if (bottom) {
    const meta = document.createElement('div');
    meta.className = 'reader-meta';
    meta.style.cssText = 'font-size:.72rem;color:var(--ink-soft);text-align:center;padding:6px 12px 10px';
    meta.innerHTML = 'النص في الملكية العامة أو برخصة حرة — ' +
      '<a href="/book/' + encodeURIComponent(state.id) + '/" style="color:inherit;text-decoration:underline">المصدر والترخيص</a> · ' +
      '<a href="/rights/?t=' + encodeURIComponent(state.id) + '" style="color:inherit;text-decoration:underline">طلب إزالة لصاحب الحق</a>';
    bottom.appendChild(meta);
  }

  // 6) print header (title + source) only visible when printing
  const stageEl = document.getElementById('readerContent');
  if (stageEl && !document.querySelector('.print-meta')) {
    const pm = document.createElement('div');
    pm.className = 'print-meta';
    pm.textContent = 'قِرطاس — ' + state.id;
    stageEl.parentNode.insertBefore(pm, stageEl);
  }
})();
