/* =====================================================
   On-demand page translation (reader)
   The user asked whether English books can be translated into Arabic for free.
   Bulk machine translation of 33M words is not realistic on free tiers, but a
   per-page translation is: MyMemory's free API allows browser calls (CORS "*")
   and ~5k characters/day anonymously. Nothing is stored; the book files stay
   untouched and the result is clearly labelled as machine translation.
   ===================================================== */
(function () {
  var MT_ENDPOINT = 'https://api.mymemory.translated.net/get';
  var MAX_BYTES = 450;                 // the API rejects long queries
  var label = function () { return (window.QLANG === 'en' ? 'Translate this page' : 'ترجم هذه الصفحة'); };
  var heading = function () { return (window.QLANG === 'en' ? 'Machine translation (MyMemory)' : 'ترجمة آلية (MyMemory)'); };
  var failed = function () { return (window.QLANG === 'en' ? 'The translation service did not answer. Try again later or use an external translator.' : 'لم يستجب خدمة الترجمة. جرّب لاحقًا أو استخدم مترجمًا خارجيًا.'); };
  var quota = function () { return (window.QLANG === 'en' ? 'The free daily quota of the translation service is exhausted.' : 'انتهت الحصة المجانية اليومية لخدمة الترجمة.'); };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function targetLang() { return (window.QLANG === 'en') ? 'en' : 'ar'; }
  function sourceLang() { return (window.QBOOK_LANG === 'ar') ? 'ar' : 'en'; }

  function chunk(text) {
    var out = [], cur = '';
    var parts = String(text).split(/\n\n+/);
    for (var i = 0; i < parts.length; i++) {
      var candidate = cur ? cur + '\n\n' + parts[i] : parts[i];
      if (new TextEncoder().encode(candidate).length > MAX_BYTES) {
        if (cur) out.push(cur);
        // a single paragraph longer than the limit: cut it on word boundaries
        var words = parts[i].split(/\s+/), line = '';
        for (var w = 0; w < words.length; w++) {
          var next = line ? line + ' ' + words[w] : words[w];
          if (new TextEncoder().encode(next).length > MAX_BYTES) { out.push(line); line = words[w]; }
          else line = next;
        }
        cur = line;
      } else cur = candidate;
    }
    if (cur) out.push(cur);
    return out.filter(Boolean);
  }

  function panel() {
    var p = document.getElementById('trPanel');
    if (p) return p;
    p = document.createElement('section');
    p.id = 'trPanel';
    p.className = 'tr-panel';
    p.hidden = true;
    var stage = document.querySelector('.reader-stage');
    if (stage && stage.parentNode) stage.parentNode.insertBefore(p, stage.nextSibling);
    else document.body.appendChild(p);
    return p;
  }

  async function translate() {
    var host = document.getElementById('readerContent');
    if (!host) return;
    var btn = document.getElementById('btnTranslate');
    var paras = [].slice.call(host.querySelectorAll('p')).map(function (x) { return x.textContent.trim(); }).filter(Boolean);
    if (!paras.length) return;
    if (sourceLang() === targetLang()) {
      var p0 = panel();
      p0.hidden = false;
      p0.innerHTML = '<div class="tr-head">' + heading() + '</div><p class="tr-note">' +
        (window.QLANG === 'en' ? 'This text is already in your interface language.' : 'نص هذا الكتاب بلغة الواجهة نفسها.') + '</p>';
      return;
    }
    var p = panel();
    p.hidden = false;
    p.innerHTML = '<div class="tr-head">' + heading() + '</div><p class="tr-note">' +
      (window.QLANG === 'en' ? 'Translating…' : 'جارٍ الترجمة…') + '</p>';
    if (btn) { btn.disabled = true; btn.textContent = (window.QLANG === 'en' ? 'Translating…' : 'جارٍ الترجمة…'); }

    var chunks = chunk(paras.join('\n\n'));
    var html = '<div class="tr-head">' + heading() + ' <span class="tr-src">' + sourceLang() + '→' + targetLang() + '</span></div>';
    var done = 0;
    for (var i = 0; i < chunks.length; i++) {
      try {
        var url = MT_ENDPOINT + '?q=' + encodeURIComponent(chunks[i]) + '&langpair=' + sourceLang() + '|' + targetLang();
        var res = await fetch(url, { cache: 'no-store' });
        var j = await res.json();
        var t = j && j.responseData && j.responseData.translatedText;
        if (!t || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(String(t))) {
          html += '<p class="tr-note tr-warn">' + quota() + '</p>';
          p.innerHTML = html;
          if (btn) { btn.disabled = false; btn.textContent = label(); }
          return;
        }
        html += '<p>' + esc(t) + '</p>';
        p.innerHTML = html;
        done++;
      } catch (e) {
        html += '<p class="tr-note tr-warn">' + failed() + '</p>';
        p.innerHTML = html;
        if (btn) { btn.disabled = false; btn.textContent = label(); }
        return;
      }
    }
    html += '<p class="tr-note">' + (window.QLANG === 'en'
      ? 'Machine translation of this page only; the original text is untouched. ' + done + ' segment(s).'
      : 'ترجمة آلية لهذه الصفحة فقط، والنص الأصلي كما هو. عدد المقاطع: ' + done + '.') + '</p>';
    p.innerHTML = html;
    if (btn) { btn.disabled = false; btn.textContent = label(); }
  }

  function ensureButton() {
    if (document.getElementById('btnTranslate')) return;
    var top = document.querySelector('.reader-top');
    if (!top) return;
    var b = document.createElement('button');
    b.className = 'icon-btn small';
    b.id = 'btnTranslate';
    b.type = 'button';
    b.textContent = label();
    b.title = label();
    b.addEventListener('click', translate);
    top.appendChild(b);
  }

  document.addEventListener('qirtas:lang', function () {
    var b = document.getElementById('btnTranslate');
    if (b) { b.textContent = label(); b.title = label(); }
    var p = document.getElementById('trPanel');
    if (p && !p.hidden) p.hidden = true;
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureButton);
  else ensureButton();
})();
