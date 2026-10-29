# Connections in the panel

The Network page registers an existing owned connection service with Address, SNI and Host. Registration is an authenticated management-only operation and merges endpoints without replacing existing users or nodes. A registered endpoint is not proof of successful outbound HTTPS. The existing registry supports up to 64 endpoints.

Settings contains the proxy pool for global defaults or a selected native account. Supported upstream URL schemes are `socks4://`, `socks5://`, `http://` and `https://`. Enter one URL per line, up to eight. Test proxy pool checks every unique entry with at most two concurrent requests, reports progress and a separate result for each entry, and does not save, reorder or remove entries. Failure of one proxy does not stop the remaining tests. Results do not include credentials.

The proxy probe checks the existing HTTP reachability endpoint; it does not establish TLS destination authenticity or independently verify the exit country. Use the separate live HTTPS test before relying on a route. Save settings explicitly after reviewing results; existing rotation and connection fallback continue to use the configured pool.

Cloud service provisioning from the panel and automatic discovery/import of third-party proxies are not implemented. Use the authenticated installer for provider provisioning. Provider credentials are not collected by this form, and deployment restrictions are not bypassed.

Windows builds now default the esbuild Go service to `GOMAXPROCS=2` and `GOMEMLIMIT=256MiB`, unless the operator supplied values. This bounds build resource use without changing machine-wide settings. Validation: TypeScript, 141 tests, baseline integration and installer preview; no production deployment or user migration.

## فارسی

در بخش شبکه می‌توانید گرهٔ موجود خودتان را ثبت کنید. برای پروکسی‌ها، تنظیمات حساب یا پیش‌فرض‌ها را باز کنید، حداکثر هشت آدرس وارد و «آزمون استخر پروکسی» را اجرا کنید. نتیجهٔ هر مورد جدا نمایش داده می‌شود؛ ذخیرهٔ تنظیمات همچنان صریح است. ثبت گره و پاسخ آزمون پروکسی، تأیید اتصال HTTPS یا کشور خروجی نیست.

نصب خودکار سرویس ابری از داخل پنل و کشف خودکار پروکسی در این نسخه وجود ندارند. برای استقرار از نصاب استفاده کنید.
