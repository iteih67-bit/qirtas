var __QBASE = (function () {
  // derive the deployed base from this script's own URL first (order independent),
  // then fall back to the injected site URL
  try {
    var src = (document.currentScript && document.currentScript.src) || '';
    if (src) { var m = new URL(src).pathname.match(/^(.*?)\/assets\/js\/[^/]+$/); if (m) return m[1] || ''; }
  } catch (e) {}
  try { if (window.QIRTAS && window.QIRTAS.site) return new URL(window.QIRTAS.site).pathname.replace(/\/$/, ''); } catch (e) {}
  return '';
})();
/* Qirtas library — client-side search and pagination, plus an on-demand
   external catalogue (metadata + outbound reading links).
   There are deliberately no categories and no filters in this interface:
   the only controls are the search box and the pagination buttons. */
'use strict';
(function () {
  var PER = 24;
  var el = {
    input: document.getElementById('libSearch'),
    clear: document.getElementById('libClear'),
    status: document.getElementById('libStatus'),
    results: document.getElementById('libResults'),
    pager: document.getElementById('libPager'),
    info: document.getElementById('pageInfo'),
    prev: document.getElementById('pagePrev'),
    next: document.getElementById('pageNext'),
    count: document.getElementById('libCount'),
    extWrap: document.getElementById('libExternal'),
    extBtn: document.getElementById('extLoad'),
    extCount: document.getElementById('extCount'),
    extResults: document.getElementById('extResults'),
  };
  if (!el.results) return;

  var INDEX = null, EXTERNAL = null, extLoaded = false;
  var view = { q: '', page: 1 };
  var filtered = [];

  /* --- Arabic-aware normalization (mirrors pipeline/lib/arabic.js) --- */
  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
      .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
      .replace(/\u0649/g, '\u064A')
      .replace(/\u0629/g, '\u0647')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function dirOf(b) { return (b.lang === 'ar') ? 'rtl' : 'ltr'; }

  function card(b) {
    return '<a class="book-card" href="/book/' + encodeURIComponent(b.id) + '/" aria-label="' + esc(b.t) + '">' +
      '<div class="cover ' + esc(b.g || 'cover-g3') + '">' +
        '<span class="cov-title">' + esc(b.t) + '</span>' +
        '<span class="cov-author">' + esc(b.a) + '</span>' +
        '<span class="cov-orn">' + esc(b.e || '📚') + '</span>' +
      '</div>' +
      '<div class="book-meta" dir="' + dirOf(b) + '"><strong>' + esc(b.t) + '</strong>' +
      '<span>' + esc(b.a) + (b.src ? ' · ' + esc(b.src) : '') + '</span></div>' +
    '</a>';
  }

  function readURL() {
    var p = new URLSearchParams(location.search);
    view.q = p.get('q') || '';
    view.page = Math.max(1, parseInt(p.get('page') || '1', 10) || 1);
    el.input.value = view.q;
    el.clear.classList.toggle('hidden', !view.q);
  }
  function writeURL() {
    var p = new URLSearchParams();
    if (view.q) p.set('q', view.q);
    if (view.page > 1) p.set('page', String(view.page));
    var qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  function matches(item, terms) {
    if (!terms.length) return true;
    var hay = item.k || norm(item.t + ' ' + item.a);
    for (var i = 0; i < terms.length; i++) if (hay.indexOf(terms[i]) === -1) return false;
    return true;
  }

  function apply() {
    var q = norm(view.q);
    var terms = q ? q.split(' ').filter(Boolean) : [];
    filtered = (INDEX.books || []).filter(function (b) {
      if (!terms.length) return true;
      var hay = b.k || norm(b.t + ' ' + b.te + ' ' + b.a + ' ' + b.ae);
      for (var i = 0; i < terms.length; i++) if (hay.indexOf(terms[i]) === -1) return false;
      return true;
    });
    if (q) {
      var first = terms[0];
      filtered.sort(function (a, b) {
        var ai = (a.k || '').indexOf(first), bi = (b.k || '').indexOf(first);
        var ap = ai === 0 ? 0 : ai > 0 ? 1 : 2, bp = bi === 0 ? 0 : bi > 0 ? 1 : 2;
        if (ap !== bp) return ap - bp;
        return String(a.t).localeCompare(String(b.t), 'ar');
      });
    } else {
      filtered.sort(function (a, b) { return String(b.ad || '').localeCompare(String(a.ad || '')); });
    }
  }

  function render() {
    var total = filtered.length;
    var pages = Math.max(1, Math.ceil(total / PER));
    if (view.page > pages) view.page = pages;
    var slice = filtered.slice((view.page - 1) * PER, view.page * PER);
    el.count.textContent = (INDEX.count || total).toLocaleString('en-US');
    el.status.innerHTML = total
      ? 'يُعرض <b>' + slice.length + '</b> من <b>' + total.toLocaleString('en-US') + '</b> كتاباً متاحاً للقراءة هنا' +
        (view.q ? ' — نتائج البحث عن «' + esc(view.q) + '»' : '')
      : '';
    if (!total) {
      el.results.innerHTML = '<div class="lib-empty">' +
        '<div class="emoji">🔍</div><h3>لا توجد نتائج مطابقة في الكتب المتاحة للقراءة هنا</h3>' +
        '<p>جرّب كلمات أقل أو تهجئة أخرى للاسم، أو ابحث في الفهرس الأوسع بالأسفل.</p>' +
        '<button class="btn btn-accent" id="libResetEmpty">إعادة ضبط البحث</button></div>';
      var b = document.getElementById('libResetEmpty');
      if (b) b.addEventListener('click', reset);
      el.pager.classList.add('hidden');
      if (el.extBtn && !extLoaded) { el.extBtn.classList.add('pulse'); }
      return;
    }
    el.results.innerHTML = '<div class="book-grid">' + slice.map(card).join('') + '</div>';
    el.pager.classList.toggle('hidden', pages <= 1);
    el.info.textContent = view.page + ' / ' + pages;
    el.prev.disabled = view.page <= 1;
    el.next.disabled = view.page >= pages;
  }

  function refresh() { apply(); render(); writeURL(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  function reset() {
    view = { q: '', page: 1 };
    el.input.value = '';
    el.clear.classList.add('hidden');
    refresh();
  }

  /* ---------- external catalogue (metadata + outbound links) ---------- */
  function renderExternal(force) {
    if (!EXTERNAL) return;
    var q = norm(view.q);
    var terms = q ? q.split(' ').filter(Boolean) : [];
    var list = EXTERNAL.filter(function (x) { return matches(x, terms); });
    var shown = list.slice(0, 60);
    el.extCount.textContent = (EXTERNAL.length || 0).toLocaleString('en-US');
    el.extResults.innerHTML =
      '<div class="lib-status">' + (list.length
        ? 'يُعرض <b>' + shown.length + '</b> من <b>' + list.length.toLocaleString('en-US') + '</b> نتيجة في الفهرس الأوسع' + (view.q ? ' عن «' + esc(view.q) + '»' : '')
        : 'لا نتائج مطابقة في الفهرس الأوسع') + '</div>' +
      '<ul class="ext-list">' + shown.map(function (x) {
        return '<li>' +
          '<div class="ext-main"><strong dir="' + (x.lang === 'ar' ? 'rtl' : 'ltr') + '">' + esc(x.t) + '</strong>' +
          '<span>' + esc(x.a || '—') + (x.y ? ' · ' + esc(String(x.y)) : '') + '</span>' +
          (x.s ? '<em>' + esc(x.s) + '</em>' : '') +
          '<span class="ext-badge">بيانات وصفية — النص لدى المصدر</span></div>' +
          '<div class="ext-actions">' +
          '<a class="btn btn-ghost small" href="' + esc(x.u) + '" target="_blank" rel="noopener nofollow">اقرأ من المصدر الرسمي ↗</a>' +
          '<a class="ext-rights" href="/rights/?t=' + encodeURIComponent(x.t) + '&u=' + encodeURIComponent(x.u) + '">صاحب حق؟ اطلب تحويل الرابط</a>' +
          '</div>' +
        '</li>';
      }).join('') + '</ul>' +
      '<p class="ext-note">هذه عناوين من فهرس مرجعي عام: نعرض بياناتها ونربطك بالمصدر الرسمي، ولا نستضيف ملفاتها. ' +
      'إن كنت صاحب حق أي كتاب، <a href="/rights/">اطلب تحويل الرابط إلى موقعك الرسمي أو إزالة البيانات</a>.</p>';
    if (force) el.extResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function loadExternal() {
    if (extLoaded) { renderExternal(true); return; }
    el.extBtn.disabled = true;
    el.extBtn.textContent = 'جارٍ تحميل الفهرس الأوسع…';
    fetch(__QBASE + '/external-index.json', { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        EXTERNAL = j;
        extLoaded = true;
        el.extBtn.textContent = 'تحديث النتائج';
        el.extBtn.disabled = false;
        renderExternal(true);
      })
      .catch(function (e) {
        el.extBtn.disabled = false;
        el.extBtn.textContent = 'إعادة محاولة التحميل';
        el.extResults.innerHTML = '<div class="lib-empty"><div class="emoji">⚠️</div><h3>تعذّر تحميل الفهرس الأوسع</h3><p>' + esc(String((e && e.message) || e)) + '</p></div>';
      });
  }

  /* --- events --- */
  var t;
  el.input.addEventListener('input', function () {
    clearTimeout(t);
    t = setTimeout(function () {
      view.q = el.input.value.trim(); view.page = 1;
      el.clear.classList.toggle('hidden', !view.q);
      refresh();
      if (extLoaded) renderExternal(false);
    }, 180);
  });
  el.clear.addEventListener('click', function () { el.input.value = ''; view.q = ''; el.clear.classList.add('hidden'); view.page = 1; refresh(); el.input.focus(); });
  el.prev.addEventListener('click', function () { if (view.page > 1) { view.page--; refresh(); } });
  el.next.addEventListener('click', function () { view.page++; refresh(); });
  addEventListener('popstate', function () { readURL(); apply(); render(); if (extLoaded) renderExternal(false); });
  if (el.extBtn) el.extBtn.addEventListener('click', loadExternal);

  function fail(msg) {
    el.status.innerHTML = '';
    el.results.innerHTML = '<div class="lib-empty"><div class="emoji">⚠️</div>' +
      '<h3>تعذّر تحميل فهرس المكتبة</h3><p>' + esc(msg) + '</p>' +
      '<button class="btn btn-accent" id="libRetry">إعادة المحاولة</button></div>';
    var b = document.getElementById('libRetry');
    if (b) b.addEventListener('click', function () { b.disabled = true; b.textContent = 'جارٍ المحاولة…'; load(); });
  }

  function load() {
    el.status.textContent = 'جارٍ تحميل الفهرس…';
    fetch(__QBASE + '/books-index.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { INDEX = j; readURL(); apply(); render(); })
      .catch(function (e) { fail(String((e && e.message) || e)); });
  }

  load();
})();
