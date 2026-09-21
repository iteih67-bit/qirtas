// Harvest Arabic public-domain books from Arabic Wikisource (curated seed list).
// Reports found/missing — reviewed manually before accepting.
'use strict';
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const {
  readCatalog, writeCatalog, saveText, asciiSlug, countWords, fetchPolite, sleep, log,
  COVERS, EMOJIS, CACHE,
} = require('./lib/common');

const API = 'https://ar.wikisource.org/w/api.php';
const MAX_CHAPTERS = 40;

// Curated candidates (classics expected on ar.wikisource) — the run reports misses.
const SEED = [
  { main: 'ألف ليلة وليلة', slug: 'one-thousand-and-one-nights-ar', title: 'ألف ليلة وليلة', enTitle: 'One Thousand and One Nights (Arabic)', author: 'مجهول المؤلف', enAuthor: 'Anonymous', year: 'القرن التاسع الميلادي',
    desc: 'أشهر مجموعة حكايات في الأدب الشرقي: شهرزاد التي حكيت ليلةً بعد ليلة كي تحفظ حياتها.' },
  { main: 'كليلة ودمنة', slug: 'kalila-wa-dimna', title: 'كليلة ودمنة', enTitle: 'Kalila wa Dimna', author: 'ابن المقفع', enAuthor: 'Ibn al-Muqaffa', year: 'القرن الثامن الميلادي',
    desc: 'كتاب الحكمة والحياة: حكايات رمزية عن الحيوان تُعظّم عبر أمثال الأسد والثور والجعلين.' },
  { main: 'مقامات بديع الزمان الهمذاني', slug: 'maqamat-al-hamadhani', title: 'مقامات بديع الزمان الهمذاني', enTitle: 'Maqamat of Badi al-Zaman al-Hamadhani', author: 'بديع الزمان الهمذاني', enAuthor: 'Badi al-Zaman al-Hamadhani', year: 'القرن الرابع الهجري',
    desc: 'أول مقامات الأدب العربي: رحلات العاقل أبي الفتح الإسكندري في مدن المشرق بلغة متشعبة الإعجاز.' },
  { main: 'مقامات الحريري', slug: 'maqamat-al-hariri', title: 'مقامات الحريري', enTitle: 'Maqamat al-Hariri', author: 'القاسم بن علي الحريري', enAuthor: 'Al-Hariri of Basra', year: 'القرن السادس الهجري',
    desc: 'أشهر كتب المقامات وأبلغها: خمسون مقامة من بديع اللغة العربية ورحلة أبي زيد السروجي.' },
  { main: 'البخلاء', slug: 'al-bukhala', title: 'البخلاء', enTitle: 'The Misers (Al-Bukhala)', author: 'الجاحظ', enAuthor: 'Al-Jahiz', year: 'القرن الثالث الهجري',
    desc: 'من أمتع كتب الأدب العربي: الجاحظ يسرد طبائع البخلاء وسواد أطوارهم بنثر ساخر بديع.' },
  { main: 'الرسالة الغفران', slug: 'risalat-al-ghufran', title: 'الرسالة الغفران', enTitle: 'Risalat al-Ghufran', author: 'أبو العلاء المعري', enAuthor: 'Al-Maarri', year: 'القرن الخامس الهجري',
    desc: 'رحلة أدبية خيالية إلى العالم الآخر يلتقي فيها الشاعر بكتّاب الجاهلية والإسلام — الديوان الملهم بالكوميديا الإلهية.' },
  { main: 'ديوان المتنبي', slug: 'diwan-al-mutanabbi', title: 'ديوان المتنبي', enTitle: 'Diwan of Al-Mutanabbi', author: 'أبو الطيب المتنبي', enAuthor: 'Al-Mutanabbi', year: 'القرن الرابع الهجري',
    desc: 'ديوان أشهر شعراء العربية: من فخر المتنبي إلى مدائعه وحكمه الخالدة.' },
  { main: 'مقدمة ابن خلدون', slug: 'muqaddimat-ibn-khaldun', title: 'مقدمة ابن خلدون', enTitle: 'The Muqaddimah', author: 'ابن خلدون', enAuthor: 'Ibn Khaldun', year: 'القرن الثامن الهجري',
    desc: 'أعظم كتب الاجتماع والتاريخ في التراث: نظرية العمران البشري وعلل قيام الدول وسقوطها.' },
];

const q = (o) => new URLSearchParams(o).toString();

async function apiGet(params) {
  const res = await fetchPolite(API + '?' + q({ format: 'json', ...params }));
  return res.json();
}

async function getSubpages(main) {
  const data = await apiGet({ action: 'query', list: 'allpages', apprefix: main + '/', aplimit: '200' });
  return (data.query?.allpages || []).map((p) => p.title);
}

function htmlToParagraphs(html) {
  const $ = cheerio.load(html);
  const out = $('.mw-parser-output').clone();
  out.find('table, style, .mw-editsection, .noprint, .ws-noexport, .navbox, .sidebar, .hatnote, .toc, .mw-references-wrap, .error, .thumb, .licenseContainer, div.printfooter, .mw-jump-link').remove();
  const paragraphs = [];
  out.find('p, li').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 2 && !/^\[\d+\]$/.test(text)) paragraphs.push(text);
  });
  return paragraphs;
}

async function fetchPageHtml(title) {
  const data = await apiGet({ action: 'parse', page: title, prop: 'text', disablelimitreport: 1 });
  if (data.error) throw new Error(data.error.info || 'parse error');
  return data.parse.text['*'];
}

(async () => {
  const catalog = readCatalog();
  const usedSlugs = new Set(catalog.map((b) => b.id));
  const report = [];

  for (const seed of SEED) {
    if (!seed.main) continue;
    log('— ' + seed.main);
    try {
      let pageTitles = await getSubpages(seed.main);
      let chaptersSource = pageTitles;
      if (!chaptersSource.length) chaptersSource = [seed.main];
      if (chaptersSource.length > MAX_CHAPTERS) {
        log(`   (${chaptersSource.length} pages — keeping first ${MAX_CHAPTERS})`);
        chaptersSource = chaptersSource.slice(0, MAX_CHAPTERS);
      }
      const chapters = [];
      for (const t of chaptersSource) {
        const html = await fetchPageHtml(t);
        const paragraphs = htmlToParagraphs(html);
        if (paragraphs.length < 2) continue;
        const label = t.includes('/') ? t.split('/').slice(1).join(' / ') : t;
        chapters.push({ title: { ar: label, en: label }, paragraphs });
        await sleep(350);
      }
      if (chapters.length < 1 || chapters.reduce((n, c) => n + c.paragraphs.length, 0) < 20) {
        throw new Error('content too thin (' + chapters.length + ' chapters)');
      }
      const id = usedSlugs.has(seed.slug) ? seed.slug + '-ar' : seed.slug;
      usedSlugs.add(id);
      saveText({ id, chapters });
      catalog.push({
        id,
        source: 'wikisource',
        title: { ar: seed.title, en: seed.enTitle },
        author: { ar: seed.author, en: seed.enAuthor },
        year: seed.year,
        lang: 'ar',
        cat: 'arabic',
        description: { ar: seed.desc, en: seed.desc + ' (In Arabic.)' },
        grad: COVERS[catalog.length % COVERS.length],
        emoji: EMOJIS[catalog.length % EMOJIS.length],
        chapters: chapters.length,
        words: chapters.reduce((n, c) => n + countWords(c.paragraphs), 0),
        addedAt: new Date().toISOString().slice(0, 10),
      });
      report.push({ main: seed.main, status: 'OK', chapters: chapters.length, words: catalog.at(-1).words });
      log(`   ✓ ${chapters.length} فصول — ${catalog.at(-1).words} كلمة`);
      await sleep(400);
    } catch (e) {
      report.push({ main: seed.main, status: 'MISS', reason: e.message.slice(0, 60) });
      log('   ✗ ' + e.message.slice(0, 60));
    }
  }

  writeCatalog(catalog);
  fs.writeFileSync(path.join(CACHE, 'wikisource-report.json'), JSON.stringify(report, null, 2));
  const okCount = report.filter((r) => r.status === 'OK').length;
  log(`DONE — found ${okCount}/${SEED.filter((s) => s.main).length}. Catalog total: ${catalog.length}`);
})();
