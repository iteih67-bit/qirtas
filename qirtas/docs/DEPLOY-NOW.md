# تثبيت الموقع على GitHub — خطوات جاهزة (بدون إدخال كلمة مرور)

هذا الملف يشرح الطريق الأقصر لنشر «قِرطاس» على GitHub Pages. المفتاح SSH على هذا الجهاز مُسجَّل مسبقًا في حسابك ويُعرّفك كـ **iteih67-bit**، أي أن الرفع (push) لا يحتاج كلمة مرور ولا رمز تحقق. الشيء الوحيد الناقص هو **إنشاء المستودع نفسه**، وهي خطوة تتطلب جلوسك على المتصفح مرة واحدة.

## الحالة الحالية (متحقَّق منها فعليًا)

| الفحص | النتيجة |
|---|---|
| `ssh -T git@github.com` | ✅ `Hi iteih67-bit! You've successfully authenticated` |
| `git remote -v` | ✅ `origin  git@github.com:iteih67-bit/qirtas.git` |
| الفرع المحلي | ✅ `main` |
| عدد الملفات المتعقَّبة | 966 ملفًا |
| حجم الحزمة المضغوطة | 97.10 MiB |
| `git push --dry-run origin main` | ❌ `ERROR: Repository not found` — المستودع غير موجود بعد |

## المطلوب منك (دقيقة واحدة)

1. افتح: https://github.com/new?name=qirtas
2. تأكد أن المالك (Owner) هو **iteih67-bit**، والاسم **qirtas**.
3. اختر **Public** (أو Private إن أردت؛ Pages يعمل مع الاثنين في الحسابات المجانية للمستودعات العامة).
4. **لا تُشغّل** أيًّا من خيارات التهيئة (لا README، لا .gitignore، لا License) — المستودع يجب أن يكون فارغًا تمامًا.
5. اضغط **Create repository**.

## ثم (أمر واحد، أو أخبرني وأنا أُنفّذه)

```powershell
cd C:\Users\AsaadM\Documents\Books
git push -u origin main
```

## تشغيل النشر التلقائي

1. في المستودع: **Settings → Pages**.
2. عند **Source** اختر **GitHub Actions** (لا تختر "Deploy from a branch").
3. لا تحتاج أي إعداد آخر: سير العمل `.github/workflows/pages.yml` يبني الموقع في CI (فهرس البحث → البناء → ملفات EPUB → فحص السلامة → فحص الدخان) ثم ينشره.
4. الرابط النهائي: `https://iteih67-bit.github.io/qirtas/`

## ملاحظات تشغيلية

- كل `git push` إلى `main` يُعيد البناء والنشر تلقائيًا.
- حجم النشر المتوقع: ~500MB (231MB نصوص + 239MB ملفات EPUB). حد GitHub Pages هو 1GB للموقع.
- لتخفيف الحجم: احذف خطوة «Build EPUB downloads» من `pages.yml` (يبقى البحث والقراءة كاملين، ويبقى تنزيل EPUB متاحًا عند تشغيل الخادم المحلي `npm start`).
- للتحقق بعد النشر: افتح `https://iteih67-bit.github.io/qirtas/` ثم `/library/` ثم `/authors/` ثم صفحة كتاب ثم `/admin/` (لوحة التحكم لا تعمل على الاستضافة الثابتة — هي تعمل مع الخادم المحلي فقط، وهذا مقصود).
- العرض المحلي دائمًا متاح: `cd qirtas; npm start` → http://localhost:8081
