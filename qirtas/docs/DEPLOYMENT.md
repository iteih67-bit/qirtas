# 🚀 دليل نشر منصة قِرطاس — كامل ومجاني
### الموقع + الباك-اند + خط الكتب الآلي + تطبيقات الموبايل
> كل ما في هذا الدليل مجاني 100%. الوحيد المدفوع (اختياري مؤجل): دومين 10$/سنة، Google Play بـ25$، Apple بـ99$/سنة — تُدفع من أول إيراد إعلاني.

---

## الوضع الحالي (جاهز على جهازك)

```
qirtas/
├── books-data/          101 كتاباً (95 إنجليزي + 6 عربية تراثية) — كتالوج + نصوص
├── pipeline/            خط جذب الكتب الآلي (Gutenberg + ويكي مصدر)
├── site/dist/           الموقع المولّد: 206 صفحات HTML جاهزة للنشر فوراً ✅
├── server.js            خادم معاينة محلي (منفذ 8081)
└── docs/                هذا الدليل
```
معاينة محلية: `npm run site:serve` ثم `http://localhost:8081`

---

## الخطوة 1 — نشر الموقع على Cloudflare Pages (10 دقائق)

**لماذا Cloudflare؟** نقل بيانات مجاني **غير محدود** (أهم بند لموقع كتب)، SSL تلقائي، رابط مجاني `qirtas.pages.dev`.

### الطريقة أ — عبر GitHub (الموصى بها: نشر تلقائي مع كل تحديث)
1. أنشئ حساباً مجانياً على [github.com](https://github.com) ثم مستودعاً جديداً باسم `qirtas` (Public).
2. من جهازك:
```bash
cd qirtas
git init && git add -A && git commit -m "Qirtas platform — initial release"
git branch -M main
git remote add origin https://github.com/<اسمك>/qirtas.git
git push -u origin main
```
3. أنشئ حساباً على [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → اختر مستودع `qirtas`:
   - Build command: `npm run site:build`
   - Build output directory: `site/dist`
4. اضغط **Save and Deploy** — خلال دقيقتين موقعك حي على `https://<اسم-مشروعك>.pages.dev` 🎉
5. كل `git push` لاحق = نشر تلقائي جديد.

### الطريقة ب — مباشرة من الجهاز (بدون GitHub)
```bash
npm install -g wrangler
wrangler login          # يفتح المتصفح لتسجيل الدخول
wrangler pages deploy site/dist --project-name=qirtas
```

> ⚠️ قبل النشر: افتح `site/tools/build.js` وغيّر `SITE_URL` إلى رابطك النهائي (يؤثر على sitemap وcanonical فقط — يمكن تغييره لاحقاً).

---

## الخطوة 2 — الباك-اند الموحد: Firebase (15 دقيقة)

مشروع واحد يخدم الموقع + تطبيق Flutter + سطح المكتب: حساب واحد وموضع قراءة متزامن.

1. افتح [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → سمّه `qirtas` (عطّل Google Analytics مؤقتاً إن أردت البساطة).
2. **Authentication** → Get Started → فعّل **Google** و**Email/Password**.
3. **Firestore Database** → Create database → **Production mode** → المنطقة: `europe-west` (الأقرب للشرق الأوسط).
4. **قواعد الأمان** (Firestore → Rules) — الصق:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /books/{bookId} {
      allow read: if true;          // الميتاداتا عامة
      allow write: if false;        // تُدار من خط المحتوى فقط
    }
  }
}
```
5. **Project settings** → سجّل تطبيقات: **Web** (انسخ إعدادات SDK) و**Android** (بالحزمة `app.qirtas.reader`).
6. الحدود المجانية تكفي ~5 آلاف قارئ نشط يومياً (الكتب ملفات ثابتة على Cloudflare ولا تستهلكها).

> الربط الفعلي للموقع (زر «حفظ موضعي على السحابة») خطوة تالية بعد النشر — الموقع الحالي يحفظ محلياً ويعمل كاملاً بدونه.

---

## الخطوة 3 — خط الكتب الأسبوعي الآلي (GitHub Actions)

1. في المستودع: `.github/workflows/books.yml`:
```yaml
name: Weekly books harvest
on:
  schedule: [{cron: '0 6 * * 1'}]   # كل إثنين 6 صباحاً
  workflow_dispatch:                  # وتشغيل يدوي
jobs:
  harvest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install
      - run: node pipeline/harvest-gutenberg.js --limit=30
      - run: node pipeline/fetch-gutenberg.js --limit=25
      - run: node pipeline/dedupe.js && node pipeline/fix-authors.js
      - run: node site/tools/build.js
      - uses: peter-evans/create-pull-request@v6
        with:
          title: '📚 كتب جديدة أسبوعياً — للمراجعة'
          branch: books-update
```
2. كل إثنين سيفتح لك **Pull Request** فيه الكتب الجديدة — تراجع العناوين دقيقتين وتدمج → النشر للموقع تلقائي.
3. قائمة المرشحين العرب يدوياً: أضف عناوين جديدة إلى `SEED` في `pipeline/wikisource.js` وشغّل `npm run books:arabic` — راجع العينات قبل الدمج (كما فعلنا).

---

## الخطوة 4 — تطبيق الموبايل (Flutter — المرحلة التالية)

نسخة PWA الموجودة (`reading-app-mvp/` مع مجلد `android/` الجاهز) **تعمل الآن** — بناء APK: راجع `reading-app-mvp/BUILD-MOBILE.md`.

تطبيق Flutter الكامل (المرحلة 2 من الخطة):
```bash
# بعد تثبيت Flutter SDK (docs.flutter.dev — مجاني)
flutter create app --org app.qirtas
cd app && flutter pub add firebase_core firebase_auth cloud_firestore google_mobile_ads
# انقل تصميم MVP (الشاشات مصممة ومختبرة) + محرك الترقيم نفسه
flutter build apk --release       # APK مباشر مجاناً
flutter build appbundle           # AAB لمتجر Play لاحقاً
```

### متاجر مجانية (بدون 25$):
| المتجر | الرسوم | الرابط |
|---|---|---|
| توزيع APK مباشر من موقعك | 0$ | ارفع الملف في Cloudflare Pages |
| Amazon Appstore | 0$ | developer.amazon.com |
| Samsung Galaxy Store | 0$ | developer.samsung.com/galaxy-store |
| Huawei AppGallery | 0$ | developer.huawei.com |
| Google Play | 25$ مرة واحدة | من أول إيراد AdMob |

---

## الخطوة 5 — الإعلانات (بعد الإطلاق بأسبوع)

1. **AdSense للموقع**: [google.com/adsense](https://google.com/adsense) → أضف الموقع → بعد الموافقة، أنشئ وحدتَي إعلان (بانر + بيني) → استبدل العنصرين المعلّمين في الموقع:
   - البانر: `<div class="ad-banner">` في `site/assets/` (القارئ)
   - البيني: دالة `showInterstitial()` في `assets/js/reader.js` — ضع كود AdSense مكان الواجهة التجريبية
2. **AdMob للتطبيق**: [apps.admob.com](https://apps.admob.com) → أضف التطبيق → وحدات Baner/Interstitial/Rewarded → استبدل معرّفات الاختبار في Flutter.
3. التزم قواعد الدراسة: لا إعلان داخل نص الصفحة، بيني واحد كل 10 دقائق كحد أقصى.

---

## الخطوة 6 — الدومين (اختياري، 10$/سنة من أول إيراد)

1. اشترِ `qirtas.app` أو ما شابه من Namecheap/Cloudflare Registrar.
2. Cloudflare Pages → Custom domains → أضف الدومين → SSL تلقائي.
3. حدّث `SITE_URL` في `site/tools/build.js` → `npm run site:build` → push.

---

## جدول التكلفة النهائي

| البند | الآن | لاحقاً (اختياري) |
|---|---|---|
| الموقع + CDN | 0$ (Cloudflare Pages) | — |
| الباك-اند | 0$ (Firebase Spark) | ترقية عند 5K+ نشط (من الإيراد) |
| الكود والنسخ الاحتياطي | 0$ (GitHub) | — |
| خط الكتب الآلي | 0$ (GitHub Actions) | — |
| التطبيق (APK مباشر + متاجر مجانية) | 0$ | Play 25$ مرة واحدة |
| الدومين | 0$ (pages.dev) | 10$/سنة |
| **الإجمالي للانطلاق** | **0$** | — |

---

## استكشاف الأخطاء
| المشكلة | الحل |
|---|---|
| Cloudflare build فشل | تأكد أن Build command = `npm run site:build` والمجلد `site/dist`، وأن Node 20+ |
| صفحات الكتب 404 بعد النشر | الروابط بمسارات مجلدات (`/book/id/`) — Cloudflare يدعمها تلقائياً |
| القارئ «تعذر تحميل الكتاب» | `books/<id>.json` مفقود — شغّل `npm run site:build` بعد أي إضافة كتب |
| Firestore permission-denied | راجع قواعد الأمان في الخطوة 2.4 |
| نص عربي به مربعات | الخطوط محلية في `/fonts` — لا تحذفها من `mobile-dist` أو `dist` |
