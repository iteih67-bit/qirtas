/* Qirtas interface language (chrome only).
   The books keep their own language; this switch translates the interface shell
   (navigation, buttons, statuses) between Arabic and English and remembers the
   choice. It removes the earlier confusion where only the reader had a toggle. */
(function () {
  var KEY = 'q.lang';
  var DICT = {
    ar: {
      'nav.library': 'المكتبة', 'nav.authors': 'المؤلفون', 'nav.stats': 'الإحصاءات',
      'nav.about': 'عن المنصة', 'nav.rights': 'حقوق النشر', 'nav.contact': 'تواصل', 'nav.privacy': 'الخصوصية',
      'nav.search': 'ابحث عن كتاب أو مؤلف…',
      'cta.browseAll': 'تصفّح المكتبة كاملة ←', 'cta.byAuthor': 'تصفّح حسب المؤلف',
      'cta.allAdditions': 'كل الإضافات ←',
      'lib.loading': 'جارٍ تحميل الفهرس…', 'lib.retry': 'إعادة المحاولة',
      'lib.emptyTitle': 'لا توجد نتائج مطابقة في الكتب المتاحة للقراءة هنا',
      'lib.emptyBody': 'جرّب كلمات أقل أو تهجئة أخرى للاسم، أو ابحث في الفهرس الأوسع بالأسفل.',
      'lib.reset': 'إعادة ضبط البحث',
      'ext.load': 'ابحث في الفهرس الأوسع', 'ext.note': 'هذه عناوين من فهرس مرجعي عام: نعرض بياناتها ونربطك بالمصدر الرسمي، ولا نستضيف ملفاتها.',
      'ext.source': 'اقرأ من المصدر الرسمي ↗', 'ext.rights': 'صاحب حق؟ اطلب تحويل الرابط',
      'toggle': 'EN', 'toggleTitle': 'تغيير لغة الواجهة إلى الإنجليزية'
    },
    en: {
      'nav.library': 'Library', 'nav.authors': 'Authors', 'nav.stats': 'Statistics',
      'nav.about': 'About', 'nav.rights': 'Rights', 'nav.contact': 'Contact', 'nav.privacy': 'Privacy',
      'nav.search': 'Search a book or an author…',
      'cta.browseAll': 'Browse the whole library →', 'cta.byAuthor': 'Browse by author',
      'cta.allAdditions': 'All additions →',
      'lib.loading': 'Loading the index…', 'lib.retry': 'Try again',
      'lib.emptyTitle': 'No matching books available to read here',
      'lib.emptyBody': 'Try fewer words or another spelling, or search the wider catalogue below.',
      'lib.reset': 'Reset the search',
      'ext.load': 'Search the wider catalogue', 'ext.note': 'These are titles from a public reference catalogue: we show their metadata and link you to the official source; we do not host their files.',
      'ext.source': 'Read from the official source ↗', 'ext.rights': 'Rights holder? Ask for a link change',
      'toggle': 'ع', 'toggleTitle': 'Switch the interface language to Arabic'
    }
  };

  function current() {
    try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ar'; } catch (e) { return 'ar'; }
  }

  function apply(lang) {
    var t = DICT[lang] || DICT.ar;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    for (var el of document.querySelectorAll('[data-i18n]')) {
      var key = el.getAttribute('data-i18n');
      if (t[key] !== undefined) el.textContent = t[key];
    }
    for (var inp of document.querySelectorAll('[data-i18n-ph]')) {
      var k2 = inp.getAttribute('data-i18n-ph');
      if (t[k2] !== undefined) inp.setAttribute('placeholder', t[k2]);
    }
    var btn = document.getElementById('langBtn');
    if (btn) { btn.textContent = t.toggle; btn.setAttribute('title', t.toggleTitle); btn.setAttribute('aria-label', t.toggleTitle); }
    window.QSTR = t;                       // dynamic components (library, external list) read this
    window.QLANG = lang;
    document.dispatchEvent(new CustomEvent('qirtas:lang', { detail: { lang: lang } }));
  }

  function set(lang) {
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    apply(lang);
  }

  function init() {
    apply(current());
    var btn = document.getElementById('langBtn');
    if (btn) btn.addEventListener('click', function () { set(current() === 'ar' ? 'en' : 'ar'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
