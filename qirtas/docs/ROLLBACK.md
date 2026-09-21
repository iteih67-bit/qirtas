# النسخ الاحتياطي والتراجع — منصة قِرطاس

كل تغييرات هذه المرحلة محفوظة داخل المستودع، وكل تعديل على ملف قائم له نسخة أصلية.

## 1) نقاط التراجع الجاهزة

| ما تغيّر | النسخة الأصلية في |
|---|---|
| `qirtas/site/tools/build.js` | `qirtas/.backup-2026-09-21/site/tools/build.js` |
| `qirtas/site/assets/js/reader.js` | `qirtas/.backup-2026-09-21/site/assets/js/reader.js` |
| `qirtas/site/assets/js/home.js` | `qirtas/.backup-2026-09-21/site/assets/js/home.js` |
| `qirtas/pipeline/lib/common.js` | `qirtas/.backup-2026-09-21/pipeline/lib/common.js` |
| `qirtas/package.json` | `qirtas/.backup-2026-09-21/package.json` |
| `reading-app-mvp/js/app.js` | `reading-app-mvp/.backup-2026-09-21/js/app.js` |
| `reading-app-mvp/js/books.js` | `reading-app-mvp/.backup-2026-09-21/js/books.js` |

ملفات **جديدة** أُضيفت (حذفها لا يؤثر على النسخة القديمة):
`qirtas/pipeline/{migrate-schema,build-index,harvest-wikisource}.js`,
`qirtas/pipeline/lib/arabic.js`,
`qirtas/site/assets/js/library.js`, `qirtas/site/assets/css/library.css`,
`reading-app-mvp/tools/sync-catalog.js`.

## 2) تراجع سريع (استرجاع النسخة السابقة بالكامل)

```powershell
cd C:\Users\AsaadM\Documents\Books\qirtas
Copy-Item .backup-2026-09-21\site\tools\build.js   site\tools\build.js -Force
Copy-Item .backup-2026-09-21\site\assets\js\reader.js site\assets\js\reader.js -Force
Copy-Item .backup-2026-09-21\site\assets\js\home.js   site\assets\js\home.js -Force
Copy-Item .backup-2026-09-21\package.json package.json -Force
npm run site:build      # إعادة توليد الموقع بالنسخة القديمة
```

> ملاحظة: `books-data/catalog.json` و`books-data/texts/*` مصادر بيانات (لا تُرجَع إلا بقرار واعٍ)؛
> إرجاع المولّد وحده يعيد الموقع إلى واجهته السابقة مع بقاء الكتب الجديدة.

```powershell
cd C:\Users\AsaadM\Documents\Books\reading-app-mvp
Copy-Item .backup-2026-09-21\js\app.js   js\app.js -Force
Copy-Item .backup-2026-09-21\js\books.js js\books.js -Force
npm start
```

## 3) تراجع جزئي منظم

- **بيانات فقط** (كتاب أُضيف بالخطأ): احذف مدخله من `books-data/catalog.json` وملف `books-data/texts/<id>.json`، ثم:
  ```bash
  npm run books:index && npm run site:build
  ```
  (سكربت `books:clean` يحذف تلقائياً أي ملف نص لا يقابله مدخل في الكتالوج.)
- **واجهة فقط**: ملفات `site/assets/**` لا تحتاج إعادة بناء بيانات — يكفي `npm run site:build`.
- **المخطط**: `migrate-schema.js` إضافي (idempotent)؛ إرجاعه = حذف الحقول الجديدة فقط إن رغبت.

## 4) المراقبة

| المؤشر | كيف نراقبه | الإجراء عند التجاوز |
|---|---|---|
| حجم النشر | `(Get-ChildItem -Recurse qirtas/site/dist | Measure-Object Length -Sum)` | ضغط النصوص أو ترحيل `books/*` إلى CDN |
| نص مفقود | تحذير `⚠ no text for <id>` عند البناء | إعادة تشغيل سكربت الجذب لذلك الكتاب أو حذفه |
| فهرس البحث > 2MB | حجم `books-data/index.json` | إزالة حقول إضافية أو تقسيم الفهرس |
| فشل مصدر | `cache/*-report.json` و`cache/*-failures.json` | تشغيل الجذب لاحقاً — الفشل لا يكسر المكتبة |
