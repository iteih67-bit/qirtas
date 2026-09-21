# دليل بناء نسخة الموبايل (Android) — قِرطاس

> المشروع مهيأ بالكامل: مجلد `android/` جاهز يحتوي اسم التطبيق بالعربية (قِرطاس)، الحزمة `app.qirtas.reader`، وجميع الأيقونات وشاشات البداية بكل المقاسات (87 أصلاً تولّدت آلياً من `assets/`).
> المتبقي عليك فقط: تثبيت أدوات أندرويد ثم أمر بناء واحد.

---

## 1) المتطلبات (مرة واحدة فقط)

| الأداة | الغرض | التحميل |
|---|---|---|
| **Android Studio** (الأسهل) | يضم كل شيء: SDK + JDK + المحاكي | developer.android.com/studio |
| أو JDK 17 + Android SDK (سطر الأوامر فقط) | بلا واجهة رسومية | adoptium.net + developer.android.com |

أول مرة تفتح Android Studio: اقبل تثبيت الـ SDK الافتراضي (هذا البند «25$» الوحيد لاحقاً هو رسوم حساب النشر نفسه — بناء الـ APK مجاني تماماً).

## 2) بناء نسخة تجريبية (Debug APK) — أمر واحد

```bash
# من مجلد المشروع:
npm run build:mobile        # يحدّث mobile-dist ويزامن أندرويد
cd android
.\gradlew.bat assembleDebug # أو: افتح المجلد في Android Studio واضغط Run ▶
```

النتيجة: `android\app\build\outputs\apk\debug\app-debug.apk`
انقله لأي هاتف أندرويد وثبّته مباشرة (فعّل «التثبيت من مصادر غير معروفة»).

> أسرع طريقة: افتح مجلد `android` في Android Studio → يفهرس المشروع → زر ▶ يشغّل التطبيق على هاتفك الموصول أو المحاكي.

## 3) نسخة الإصدار الموقّعة (Release APK)

```bash
# 1) أنشئ مفتاح التوقيع (مرة واحدة في العمر — احتفظ به ولا تفقده أبداً):
keytool -genkey -v -keystore qirtas-release.keystore -alias qirtas ^
        -keyalg RSA -keysize 2048 -validity 10000
```

ثم وقّع وابنِ:

```bash
cd android
.\gradlew.bat assembleRelease
```

مع إضافة إعدادات التوقيع في `android/app/build.gradle` قبل الأمر:

```gradle
android {
    signingConfigs {
        release {
            storeFile file("../../qirtas-release.keystore")
            storePassword System.getenv("QIRTAS_KS_PASS")
            keyAlias "qirtas"
            keyPassword System.getenv("QIRTAS_KEY_PASS")
        }
    }
    buildTypes {
        release { signingConfig signingConfigs.release }
    }
}
```

(الأسلم تمرير كلمات المرور كمتغيرات بيئة لا كتابتها في الملف.)

النتيجة: `android\app\build\outputs\apk\release\app-release.apk` — جاهزة للتوزيع المباشر أو لمتاجر Amazon/Samsung/Huawei المجانية.

## 4) النشر على Google Play (عند أول 25$)

```bash
.\gradlew.bat bundleRelease   # ينتج ملف AAB بدل APK
```

الملف: `android\app\build\outputs\bundle\release\app-release.aab`
1. سجّل حساب مطوّر Google Play (25$ مرة واحدة).
2. أنشئ التطبيق باسم «قِرطاس» — الحزمة `app.qirtas.reader`.
3. ارفع ملف الـAAB + لقطات الشاشة من مجلد `docs-screenshots/`.
4. اربط AdMob (أنشئ وحدة بانر وبيني وضع المعرفات في `js/app.js` مكان الإعلانات التجريبية).

## 5) تحديث التطبيق لاحقاً (سير العمل اليومي)

عدّلت أي ملف ويب؟ أمران فقط:

```bash
npm run build:mobile   # نسخ + مزامنة
cd android && .\gradlew.bat assembleRelease
```

أو داخل Android Studio: زر **Sync** ثم ▶.

## 6) iOS؟

نفس الكود يعمل على iOS عبر `cap add ios` لكنه يتطلب جهاز Mac وXcode وحساب Apple (99$/سنة) — كما توصي الدراسة: أجّله حتى تثبت الأرقام، فمستخدمي آيفون تخدمهم نسخة PWA المثبتة من سفاري بلا أي رسوم.

## 7) مشاكل شائعة

| المشكلة | الحل |
|---|---|
| `JAVA_HOME not found` | ثبّت Android Studio كاملاً أو JDK 17 واضبط متغير البيئة |
| `SDK location not found` | أنشئ `android/local.properties` بسطر: `sdk.dir=C:\\Users\\اسمك\\AppData\\Local\\Android\\Sdk` |
| الأيقونات لا تتحدث | `npm run icons` ثم `npx @capacitor/assets generate --android` ثم `cap sync` |
| التطبيق أبيض بعد التحديث | `npm run build:mobile` (نسيان المزامنة أشهر خطأ) |
