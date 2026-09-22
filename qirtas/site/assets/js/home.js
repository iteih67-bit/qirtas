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
/* Qirtas home — continue-reading card. */
'use strict';
(function () {
  var card = document.getElementById('continueCard');
  if (!card) return;
  var all = {};
  try { all = JSON.parse(localStorage.getItem('q.progress') || '{}'); } catch (e) { all = {}; }
  var entries = Object.keys(all).map(function (k) { return Object.assign({ id: k }, all[k]); })
    .filter(function (e) { return e.ts && e.title; })
    .sort(function (a, b) { return b.ts - a.ts; });
  if (!entries.length) return;
  var e = entries[0];
  var t = (e.title && (e.title.ar || e.title.en)) || e.id;
  document.getElementById('contTitle').textContent = t;
  var chapter = e.chapterTitle ? ((e.chapterTitle.ar || e.chapterTitle.en) + ' · ') : '';
  var when = new Date(e.ts).toLocaleDateString('ar', { day: 'numeric', month: 'long' });
  document.getElementById('contMeta').textContent = chapter + 'صفحة ' + ((e.page || 0) + 1) + ' · ' + when;
  var btn = document.getElementById('contBtn');
  btn.href = '/read/' + encodeURIComponent(e.id) + '/';
  card.classList.remove('hidden');
})();
