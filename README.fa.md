<p align="center"><img src="docs/assets/github-banner.svg" alt="افرودیت؛ مدیریت شبکه در یک محیط یکپارچه" width="100%"></p>

<div dir="rtl">

# افرودیت

**مدیریت خصوصی شبکه، اشتراک تطبیقی و نصب مرحله‌به‌مرحله**

[English](README.md) · [دریافت نسخه](https://github.com/MiRHaDi/Aphrodite/releases) · [راهنمای کامل](docs/INSTALLER.fa.md)

## نصب با یک خط

فقط فرمان مناسب سیستم را در ترمینال موجود کپی کنید. نصب اولیه Git یا Node لازم نیست؛ نصب‌کننده Node 24 و وابستگی‌ها را آماده می‌کند، مقصد را می‌پرسد و توکن را با ورودی قابل‌دیدن دریافت می‌کند.

**Bash در لینوکس یا macOS**؛ curl لازم است:

</div>

```bash
bash -c 'f=$(mktemp); curl -fsSL https://raw.githubusercontent.com/MiRHaDi/Aphrodite/main/install.sh -o "$f" && bash "$f"; r=$?; rm -f "$f"; exit "$r"'
```

<div dir="rtl">

**PowerShell در ویندوز:**

</div>

```powershell
& ([scriptblock]::Create((Invoke-RestMethod 'https://raw.githubusercontent.com/MiRHaDi/Aphrodite/main/install.ps1')))
```

<div dir="rtl">

**CMD در ویندوز:**

</div>

```bat
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex (Invoke-RestMethod 'https://raw.githubusercontent.com/MiRHaDi/Aphrodite/main/install.ps1')"
```

<div dir="rtl">

فرمان‌ها نصب‌کننده همین مخزن را از HTTPS دریافت و اجرا می‌کنند. ابتدا می‌توانید [Bash](install.sh) یا [PowerShell](install.ps1) را بررسی کنید.

## مراحل روشن، ورودی خصوصی

**مقصد ← توکن قابل‌دیدن ← ساخت خروجی ← بررسی سلامت ← مشخصات خصوصی مدیریت**

نصب‌کننده فقط انگلیسی است و منوی زبان ندارد. مقصد را با حروف A تا G انتخاب کنید: Workers، Pages، Railway، Render، Docker، VPS با SSH یا فقط ساخت خروجی. رویدادهای نصب با یک شمارندهٔ پیوسته و زمان ثبت می‌شوند. رابط خود پنل همچنان پنج زبان دارد.

| مقصد | پیش‌نیاز |
|---|---|
| Workers | توکن با Workers Scripts Edit و D1 Edit؛ شناسه حساب در صورت نیاز |
| Pages | توکن با Cloudflare Pages Edit و D1 Edit |
| Railway | توکن حساب یا توکن پروژه با شناسه پروژه و محیط |
| Render | توکن، دسترسی مخزن و پلن پولی با دیسک پایدار |
| Docker | daemon فعال؛ Docker Desktop خودکار نصب نمی‌شود |
| VPS | SSH و اثرانگشت تأییدشده؛ root یا sudo بدون رمز برای پیش‌نیاز Debian/Ubuntu |

سرویس موجود بازنویسی نمی‌شود. نصب ناموفق ممکن است منابع تازه باقی بگذارد و بعضی مقصدها هزینه دارند. توکن در سورس یا فایل env نوشته نمی‌شود. [جزئیات](docs/INSTALLER.fa.md).

## قابلیت‌ها و وضعیت نسخه

مدیریت حجم و زمان حساب‌ها، مسیر خصوصی مدیریت، لینک تصادفی اشتراک، خروجی مخصوص برنامه، انتخاب دستی و خودکار و پشتیبان‌های تنظیم‌شده در یک محیط جمع شده‌اند.

تشخیص برنامه با User-Agent قطعی نیست. کشور انتخابی به خروجی واقعی همان کشور نیاز دارد. Surge فقط پروتکل‌های سازگار موجود در مبدا را می‌گیرد؛ حساب بومی VLESS خروجی Surge ندارد. [سازگاری](docs/CLIENT_PROFILES.md).

بررسی TypeScript، آزمون‌های واحد و آزمون یکپارچهٔ محلی، احراز هویت، اشتراک و حسابداری را پوشش می‌دهند. دستورها و دامنهٔ بررسی در [راهنمای آزمون](docs/VERIFICATION.md) و کارهای آینده در [نقشهٔ راه](docs/ROADMAP.md) آمده‌اند.

بررسی سلامت نصب، API خصوصی و پاسخ خالی ریشه را می‌سنجد؛ تضمین همه ISPها نیست. آزمون خروجی با `npm run test:live` انجام می‌شود. حسابداری نصب‌های جدا مستقل است.

## راهنما و مجوز

[نصب](docs/INSTALLER.fa.md) · [پروفایل‌ها](docs/CLIENT_PROFILES.md) · [مدیریت خصوصی](docs/PRIVATE_ENTRYPOINTS.md) · [معماری](docs/ARCHITECTURE.md) · [امنیت](SECURITY.md) · [مشارکت](CONTRIBUTING.md)

[MIT](LICENSE) · [اعلان‌های ضروری وابستگی‌ها](THIRD_PARTY_NOTICES.md)

</div>

نصب پیش‌فرض کلودفلر اکنون یک مرکز مدیریت و دو سرویس اتصال با حسابداری مشترک
می‌سازد؛ دیتابیس فقط در مرکز است. [معماری و شرایط انتقال](docs/ARCHITECTURE.md).

### ادامه و گسترش نصب

نصب‌های Cloudflare این نسخه انتخاب‌ها و مراحل انجام‌شده را نگه می‌دارند و کلیدها را در ذخیره‌ساز امن سیستم قرار می‌دهند. با اجرای دوباره Resume را بزنید یا با Add account، ورکرها و پیج‌های یک حساب دیگر را به همان سابسکریپشن و حسابداری اضافه کنید. انتظار روی یک خط نمایش داده می‌شود و پیام تکراری حداقل ۳۰ ثانیه فاصله دارد. جزئیات محدودیت‌ها و نصب‌های قدیمی در [راهنمای نصب](docs/INSTALLER.fa.md) آمده است.
## مبنای اتصال سالم

ساخت اختیاری با هستهٔ سالم و رابط جدید، همراه با تست مقایسه‌ای و کنترل هش، در
[راهنمای مبنای اتصال سالم](docs/WORKING_BASELINE.md) توضیح داده شده است.
این خروجی مستقل برای آزمایش محلی است و سرویس فعال یا اطلاعات کاربران را جایگزین نمی‌کند.

## وضعیت و مسیر توسعه

[سورس مرجع سالم](docs/SOURCE_BASELINE.md) · [برنامهٔ آینده](docs/ROADMAP.md) · [حافظهٔ پروژه](PROJECT_MEMORY.md) · [مسیر توسعه](PROJECT_JOURNEY.md) · [راهنمای ادامه](CONTINUITY.md)

سورس مرجع اتصال سالم در `baseline/working` همراه checksum فایل‌ها موجود است. وضعیت نسخهٔ کاندید و امکانات برنامه‌ریزی‌شده در اسناد بالا جداگانه مشخص شده است.
