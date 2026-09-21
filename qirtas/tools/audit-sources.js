// Builds the source & rights audit register from live robots.txt + API probes.
// Usage: node tools/audit-sources.js > docs/SOURCES-AUDIT.md
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const UA = 'QirtasBot/1.0 (+https://github.com/; source audit; contact: iteih67@gmail.com)';

function get(url, timeout = 25000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const req = https.get(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, timeout }, (res) => {
      let n = 0;
      res.on('data', (c) => { n += c.length; if (n > 200000) req.destroy(); });
      res.on('end', () => resolve({ status: res.statusCode, bytes: n, ms: Date.now() - started, headers: res.headers }));
      res.on('close', () => resolve({ status: res.statusCode, bytes: n, ms: Date.now() - started, headers: res.headers }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, bytes: 0, ms: Date.now() - started, error: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 0, bytes: 0, ms: Date.now() - started, error: e.message }));
  });
}

const SOURCES = [
  { key: 'gutenberg', name: 'Project Gutenberg', host: 'https://www.gutenberg.org', robots: 'https://www.gutenberg.org/robots.txt', api: 'https://www.gutenberg.org/cache/epub/1342/pg1342.txt', license: 'ملكية عامة (Public Domain)', verdict: 'مقبول — نص كامل', note: 'يُطلب استخدام ترويسة تعريفية وتحميل متحضّر (طلب/ثانية تقريبًا)' },
  { key: 'wikisource', name: 'ويكي مصدر العربية', host: 'https://ar.wikisource.org', robots: 'https://ar.wikisource.org/robots.txt', api: 'https://ar.wikisource.org/w/api.php?action=query&meta=siteinfo&format=json', license: 'ملكية عامة أو رخص حرة (CC BY / CC BY-SA)', verdict: 'مقبول — نص كامل', note: 'الواجهة الرسمية MediaWiki API مسموحة؛ نلتزم بحد الطلبات' },
  { key: 'wikisource_en', name: 'Wikisource (English)', host: 'https://en.wikisource.org', robots: 'https://en.wikisource.org/robots.txt', api: 'https://en.wikisource.org/w/api.php?action=query&meta=siteinfo&format=json', license: 'ملكية عامة أو رخص حرة', verdict: 'مقبول — نص كامل', note: 'نفس السياسة' },
  { key: 'openlibrary', name: 'Open Library', host: 'https://openlibrary.org', robots: 'https://openlibrary.org/robots.txt', api: 'https://openlibrary.org/search.json?q=language:ara&limit=1&fields=key,title', license: 'بيانات وصفية (CC0)', verdict: 'ميتاداتا وربط فقط', note: 'لا ننسخ ملفات؛ نربط بصفحة المصدر' },
  { key: 'archiveorg', name: 'Internet Archive', host: 'https://archive.org', robots: 'https://archive.org/robots.txt', api: 'https://archive.org/advancedsearch.php?q=language:(Arabic)+AND+mediatype:(texts)&rows=1&output=json&fl[]=identifier', license: 'يختلف لكل عنصر (ملكية عامة أو إعارة مقيدة)', verdict: 'ميتاداتا وربط فقط', note: 'التوزيع يحتاج فحص كل عنصر — لا نعيد النشر' },
  { key: 'standardebooks', name: 'Standard Ebooks', host: 'https://standardebooks.org', robots: 'https://standardebooks.org/robots.txt', api: 'https://standardebooks.org/feeds/atom/all', license: 'ملكية عامة (CC0 للتنسيق)', verdict: 'مقبول نظريًا — محجوب حاليًا', note: 'يردّ 401 على الطلبات الآلية من هذه البيئة؛ يؤجَّل' },
  { key: 'hindawi', name: 'مؤسسة هنداوي', host: 'https://www.hindawi.org', robots: 'https://www.hindawi.org/robots.txt', api: 'https://www.hindawi.org/books/', license: 'رخصة النُسخ الإلكترونية تقيّد إعادة النشر', verdict: 'مرفوض للنص — ربط فقط', note: 'يردّ 403 للطلبات الآلية؛ لا ننسخ ملفاته' },
  { key: 'mktbtypdf', name: 'mktbtypdf.com', host: 'https://mktbtypdf.com', robots: 'https://mktbtypdf.com/robots.txt', api: 'https://mktbtypdf.com', license: 'غير موثّق — نُسخ كتب غالبًا محمية بحقوق ناشرين', verdict: 'مرفوض قطعًا — لا جمع ولا استضافة', note: 'سبب الرفض: إعادة نشر محتوى محمي دون ترخيص' },
  { key: 'shamela', name: 'المكتبة الشاملة', host: 'https://shamela.ws', robots: 'https://shamela.ws/robots.txt', api: 'https://shamela.ws', license: 'مختلط — يحتاج فحص كل كتاب على حدة (سنة وفاة المؤلف)', verdict: 'مؤجّل — يحتاج تدقيقًا فرديًا', note: 'لن يُضاف أي كتاب قبل التحقق من ملكيته العامة' },
  { key: 'googlebooks', name: 'Google Books API', host: 'https://www.googleapis.com', robots: 'https://www.googleapis.com/robots.txt', api: 'https://www.googleapis.com/books/v1/volumes?q=arabic&maxResults=1', license: 'بيانات وصفية', verdict: 'ميتاداتا وربط فقط', note: 'حد معدل صارم (429 من هذه البيئة)' },
];

(async () => {
  const rows = [];
  for (const s of SOURCES) {
    const r = await get(s.robots, 20000);
    const api = await get(s.api, 20000);
    let robotsNote = 'تعذّر جلب robots.txt';
    if (r.status === 200 && r.bytes > 0) {
      const body = await new Promise((resolve) => {
        const t = new Map();
        t.set('disallowRoot', false);
        const req = https.get(s.robots, { headers: { 'User-Agent': UA }, timeout: 15000 }, (res) => {
          let txt = '';
          res.on('data', (c) => (txt += c));
          res.on('end', () => resolve(txt.slice(0, 6000)));
        });
        req.on('error', () => resolve(''));
        req.on('timeout', () => { req.destroy(); resolve(''); });
      });
      const hasWildcard = /User-agent:\s*\*/i.test(body);
      const blocksAll = /User-agent:\s*\*[\s\S]{0,400}?Disallow:\s*\/\s*(\n|$)/i.test(body);
      robotsNote = blocksAll ? 'يمنع كل الجمع (Disallow: /)' : hasWildcard ? 'يوجد قسم عام (*) بقيود محدّدة' : 'لا قيود عامة مُعلنة في القسم العام';
      if (api.status !== 200) robotsNote += ` — لكن الواجهة الرسمية ردّت ${api.status}`;
    }
    rows.push({ ...s, robotsStatus: r.status, robotsNote, apiStatus: api.status, apiMs: api.ms, apiBytes: api.bytes });
    await new Promise((res) => setTimeout(res, 400));
  }

  const L = [];
  L.push('# سجل المصادر والتدقيق الحقوقي — منصة قِرطاس');
  L.push('');
  L.push(`> مصدر البيانات: فحص مباشر لملفات robots.txt والواجهات الرسمية بتاريخ ${new Date().toISOString().slice(0, 10)}.`);
  L.push('> قاعدة القبول: لا يُجمع مصدر يمنع الجمع الآلي، ولا محتوى محمي بحقوق ناشر، ولا محتوى خلف DRM أو دفع أو تسجيل دخول.');
  L.push('');
  L.push('| المصدر | الترخيص | موقف robots.txt | رد الواجهة | الحكم | ملاحظة |');
  L.push('|---|---|---|---|---|---|');
  for (const r of rows) {
    L.push(`| ${r.name} (\`${r.host}\`) | ${r.license} | ${r.robotsStatus === 200 ? r.robotsNote : `تعذّر (${r.robotsStatus || 'خطأ'})`} | ${r.apiStatus} (${r.apiMs}ms) | **${r.verdict}** | ${r.note} |`);
  }
  L.push('');
  L.push('## قواعد الالتزام أثناء الجمع');
  L.push('');
  L.push('1. ترويسة تعريفية واضحة لكل طلب مع بريد تواصل.');
  L.push('2. مهلة بين الطلبات (200–350ms) وحد أقصى للتوازي = 1 في الجمع العام.');
  L.push('3. احترام robots.txt دائمًا؛ إيقاف أي مصدر يردّ 403/429 فورًا بدل الإلحاح.');
  L.push('4. تخطّي أي عنصر مدفوع أو محمي بـDRM أو يحتاج تسجيل دخول.');
  L.push('5. تخزين سجل لكل تشغيل: ما أُضيف، ما تُخطّي، ما فشل، والمدة.');
  L.push('6. كل كتاب منشور يحمل: المصدر، الترخيص، رابط النص الأصلي، ونموذج طلب إزالة.');
  L.push('');
  L.push('## مصادر مرفوضة نهائيًا');
  L.push('');
  L.push('- مواقع إعادة نشر كتب محمية (مثل `mktbtypdf.com`) — لا جمع ولا استضافة ولا ربط تشجيعي.');
  L.push('- المكتبات المختلطة غير المدقّقة — لا تُضاف إلا بعد التحقق الفردي من الملكية العامة.');
  L.push('');

  const out = L.join('\n');
  const target = process.argv[2];
  if (target) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, out); console.log('written: ' + target); }
  else console.log(out);
})();
