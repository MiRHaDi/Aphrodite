# نصب مستقل افرودیت

نتیجه آزمون زنده و مانع انتشار نهایی: [گزارش کلودفلر](CLOUDFLARE_VALIDATION.md). قالب‌های مخصوص برنامه‌ها: [پروفایل کلاینت‌ها](CLIENT_PROFILES.md).

در خطای شبکه استقرار، نصب‌کننده می‌تواند نام عمومی میزبان را از DNS روی HTTPS گوگل در 8.8.8.8 بگیرد. نام میزبان و SNI و بررسی گواهی حفظ می‌شوند؛ مسیر خصوصی و توکن و هدر درخواست به DNS فرستاده نمی‌شوند. خطاهای HTTP با IP دیگر تکرار نمی‌شوند. کد مسدودی 8000119 نیازمند بازبینی کلودفلر است.

نصب‌کننده برای Workers، Pages، Railway، Render، Docker و VPS با SSH آماده شده است. هر نصب پایگاه داده و حسابداری مستقل دارد؛ چند نصب جدا سهمیه مشترک ندارند. سرویس‌های موجود بازنویسی نمی‌شوند.

## شروع در ویندوز

بسته را استخراج کنید و در PowerShell همان پوشه اجرا کنید:

```powershell
.\install.ps1 --provider workers --name my-aphrodite
```

برای لینوکس و macOS:

```bash
bash install.sh --provider pages --name my-aphrodite
```

اسکریپت Node.js 24 رسمی را همراه بررسی SHA256 دریافت می‌کند، وابستگی‌ها را نصب و سپس توکن را در ورودی مخفی می‌گیرد. از داخل ترمینال موجود اجرا می‌شود و پنجره جدید باز نمی‌کند. دریافت وابستگی‌ها به اینترنت نیاز دارد. در اجرای تعاملی آدرس خصوصی مدیریت و رمز یک بار نمایش داده می‌شوند؛ آن‌ها را خصوصی نگه دارید.

اگر Node 24 و وابستگی‌ها را دارید، مستقیماً `node installer/cli.mjs` اجرا کنید. برای ساخت آزمایشی بدون توکن و بدون ایجاد منابع ابری:

```powershell
node installer/cli.mjs --provider workers --preview
node installer/cli.mjs --provider docker --preview
```

## مقصدها و مجوزها

| مقصد | انتخاب | نیازها |
|---|---|---|
| Cloudflare Workers | `--provider workers` | توکن ویرایش Workers و D1؛ در حساب‌های متعدد `--account ID` |
| Cloudflare Pages | `--provider pages` | توکن ویرایش Pages و D1؛ استقرار Advanced Worker |
| Railway | `--provider railway` | توکن حساب؛ یا `--project-token --project ID --environment ID` |
| Render | `--provider render --plan starter` | توکن API، دسترسی مخزن، پلن پولی با دیسک پایدار؛ در چند مالک `--owner ID` |
| Docker | `--provider docker` | Docker daemon فعال؛ نصب خودکار Docker Desktop انجام نمی‌شود |
| VPS | `--provider vps --host HOST --user root --fingerprint SHA256:VALUE` | کلید SSH با `--key PATH` یا رمز ورودی؛ اثرانگشت تأییدشده سرور |
| میزبان مشابه | `--provider bundle` | خروجی Node و Dockerfile؛ میزبان باید WebSocket و دیسک پایدار داشته باشد |

Cloudflare یک D1 تازه می‌سازد و migrationها را اعمال می‌کند. `--domain panel.example.com --zone ZONE_ID` دامنه اختصاصی را متصل می‌کند؛ مجوز DNS/دامنه هم لازم است. در Pages رکورد DNS موجود خودکار جایگزین نمی‌شود. Workers/Pages نیاز به VPS ندارند.

Railway سرویس، متغیرها، دامنه و volume می‌سازد؛ CLI رسمی را با SHA256 اعلام‌شده GitHub دریافت می‌کند. Render سرویس Docker تک‌نمونه با دیسک `/data` می‌سازد؛ پلن رایگان رد می‌شود چون دیسک پایدار لازم است. مخزن پیش‌فرض `MiRHaDi/Aphrodite` و شاخه `main` است؛ `--repo` و `--branch` قابل تنظیم‌اند. ایجاد منابع ممکن است هزینه داشته باشد.

VPS فقط در Debian/Ubuntu، با root یا sudo بدون رمز، پیش‌نیازهای Docker/Python را خودکار نصب می‌کند. اثرانگشت SSH را از مسیر قابل اعتماد مدیر سرور بگیرید؛ پذیرش خودکار کلید ناشناس وجود ندارد. `--domain` با DNS از قبل تنظیم‌شده، Caddy و HTTPS را فعال می‌کند؛ در غیر این صورت سرویس فقط روی localhost است و به تونل SSH نیاز دارد. این گزینه روی سرور برنامه نصب می‌کند؛ اگر سرور ایران باید فقط انتقال شبکه داشته باشد، این مقصد را برای آن انتخاب نکنید.

## اجرای بدون تعامل

توکن ارائه‌دهنده را فقط در محیط فرایند قرار دهید: `CLOUDFLARE_API_TOKEN`، `RAILWAY_API_TOKEN`، `RAILWAY_TOKEN` برای project token، یا `RENDER_API_KEY`. `ADMIN_TOKEN` حداقل ۲۴ کاراکتر و `ADMIN_PATH` مسیر تصادفی ۱۶ تا ۱۲۸ کاراکتری است و در اجرای بدون تعامل الزامی‌اند. برای SSH متغیر `SSH_PASSWORD` هم پشتیبانی می‌شود. هیچ رمز واقعی را در اسکریپت، Git یا فایل env ذخیره نکنید. مدیر میزبان و Docker به متغیرهای سرویس دسترسی دارند؛ خروجی برنامه رمزها را ثبت نمی‌کند.

تنظیمات پیشرفته رشته‌ای را با JSON در `APHRODITE_VARIABLES` بدهید. `--token-env NAME` نام متغیر توکن را عوض می‌کند. `--admin-path` مسیر مدیریت را مشخص می‌کند. برای Docker Compose دستی، `APHRODITE_BUILD_NONCE` غیرمحرمانه را هم تنظیم کنید؛ nonce فقط برای تازه‌سازی cache ساخت است، نه تغییر امضای برنامه.

## حدود قابلیت و آزمون

خروجی JavaScript و اسکریپت رابط با esbuild باندل و minify می‌شوند؛ کد مرده، پولیمورفیسم یا سازوکار دورزدن تشخیص ارائه نمی‌شود. شناسه ساخت تصادفی است ولی کد یکسان می‌تواند هش یکسان داشته باشد. این کار رمزنگاری یا تضمین جلوگیری از مسدودسازی نیست. SQL، تنظیمات، مجوزها و ابزارهای سیستمی خوانا می‌مانند.

اجرای مستقل از VLESS روی WebSocket، اتصال TCP و DNS روی UDP پشتیبانی می‌کند. بسته‌های ضمیمه سورس موتور Reality، AnyTLS، MTProto، WireGuard یا OpenVPN نداشتند؛ این موتورها از روی راهنمای نصب اختراع یا فعال نشده‌اند. پروتکل‌های backendهای موجود تابع قابلیت همان backend هستند.

آزمون Node و Miniflare شامل مدیریت خصوصی، ساخت حساب، لینک توکن‌دار، قالب‌های اشتراک، احراز هویت WebSocket و رزرو/بازگشت سهمیه است. تست‌های API ارائه‌دهنده با mock هستند؛ استقرار زنده Railway، Render، SSH و Cloudflare توسط این بسته هنوز تأیید نشده است. `verified` در خروجی فقط سلامت API خصوصی و پاسخ خالی ریشه را گزارش می‌کند، نه سرعت یا اتصال تمام ISPها. سرویس Node باید تک‌نمونه باشد؛ SQLite چند نمونه یا حسابداری مشترک میان نصب‌ها فراهم نشده است.

نام سرویس موجود رد می‌شود. نصب شکست‌خورده ممکن است منابع تازه‌ای باقی بگذارد؛ حذف، rollback و ارتقای خودکار پیاده‌سازی نشده‌اند. پیش از حذف دیسک/volume از داده‌ها نسخه پشتیبان بگیرید.

منابع رسمی: [Workers API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/)، [Pages Direct Upload](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)، [Railway API](https://docs.railway.com/integrations/api/api-cookbook)، [Render Docker](https://render.com/docs/docker).
