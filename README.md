# Qirtas — منصة المكتبة الرقمية العربية

موقع مكتبة رقمية عربي (RTL) + قارئ متوافق مع كل الأجهزة + قاعدة بيانات + لوحة تحكم + نظام طلبات حقوق النشر.

## التشغيل السريع

> **الواجهة خالية من التصنيفات والفلاتر عن قصد:** البحث والترقيم فقط، مع فهرس مؤلفين وتصفّح بسيط.
> **الموقع منشور على مسار فرعي** (`https://iteih67-bit.github.io/qirtas/`)، وكل الروابط تُبنى تلقائيًا على هذا الأساس.

```bash
npm install                 # cheerio فقط لخط المحتوى
npm run site:build          # توليد الموقع الثابت من قاعدة البيانات/الكتالوج
npm start                   # الموقع + الـAPI + لوحة التحكم على http://localhost:8081
```

لوحة التحكم: `http://localhost:8081/admin/` (كلمة المرور تُولَّد عند أول تشغيل في `data/admin-password.txt`، أو من متغير البيئة `ADMIN_PASSWORD`).

## البنية

| المسار | الوظيفة |
|---|---|
| `pipeline/` | خط المحتوى: الجذب، الفلترة، التنقية، الفهرسة، قاعدة البيانات |
| `pipeline/lib/db.js` + `schema.sql` | طبقة قاعدة البيانات (SQLite مدمجة في Node — بلا خدمة خارجية) |
| `site/tools/build.js` | مولّد الموقع الثابت (صفحات كتاب، مكتبة بحث، قارئ، RSS، PWA) |
| `site/assets/` | CSS/JS (بلا أطر عمل) — `reading.css` طبقة القراءة |
| `server.js` | خادم التطبيق: الموقع + `/api/*` + `/admin/*` |
| `data/qirtas.db` | قاعدة البيانات التشغيلية |
| `tools/smoke-test.js` | فحص HTTP شامل |
| `tools/width-check.js` | فحص تفاعلي بمقاسات هاتف/تابلت/حاسوب مع لقطات |
| `tools/cdp-check.js` | فحص تفاعلي كامل (بحث، فلترة، قارئ، مسارات خطأ) |
| `tools/backup.js` | نسخ احتياطي / استرجاع |
| `docs/` | الخطة، سجل المصادر، النشر، التراجع، التسليم |

## الأوامر

```bash
npm start                     # تشغيل الموقع + لوحة التحكم
npm run site:build            # بناء الموقع الثابت
npm run db:import             # كتالوج JSON → قاعدة بيانات
npm run db:export             # قاعدة بيانات → كتالوج JSON (مصدر البناء)
npm run db:verify             # تحقق من البيانات والتغطية
npm run db:search -- "الف ليله"
npm run books:ws -- --limit=45       # توسيع عربي من ويكي مصدر
npm run books:fetch -- --limit=250   # توسيع إنجليزي من جوتنبرج
npm run books:openlibrary -- --lang=ar --limit=5000
npm run books:licenses && npm run books:license-labels -- --drop-review
npm run test:smoke            # فحص شامل
npm run test:ui               # فحص تفاعلي بمتصفح حقيقي
npm run test:widths           # فحص المقاسات + لقطات
npm run backup:create         # نسخة احتياطية
npm run backup:list
npm run backup:restore -- <name>
```

## الترخيص والاستخدام

- الكود: رخصة MIT (انظر `LICENSE`).
- نصوص الكتب: ملكية عامة أو رخص حرة، ويظهر مصدر وترخيص كل كتاب في صفحته العامة.
- لأصحاب الحقوق: صفحة `/rights/` تُرسل طلبًا يُسجَّل في قاعدة البيانات بحالة معلّقة ويُراجَع ويُسجَّل قراره في سجل التدقيق.
