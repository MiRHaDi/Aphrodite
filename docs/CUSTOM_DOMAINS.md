# Custom domains and country labels

On a fresh interactive Cloudflare installation, after token entry the installer lists accessible DNS zones by number. Select a number, then accept the project name as the default subdomain or enter a different subdomain. Enter or 0 at the domain list keeps the provider hostname. Domain discovery requires Zone Read permission; existing DNS/domain setup requires the existing provider permissions. Unattended installs can supply `--domain panel.example.com --zone ZONE_ID`.

In split installations the management service uses that hostname. Same-account connection services receive `connect-primary-1.panel.example.com`, `connect-primary-2.panel.example.com`, etc. Additional accounts retain provider hostnames: a zone is never silently reused across accounts. Existing domain and certificate verification uses the provider adapter. Conflicting Pages DNS records are not overwritten. Resume keeps saved domain choices.

These are normal provider-supported custom domains. They do not guarantee infrastructure anonymity, remove provider endpoints, or bypass provider restrictions. Railway and Render custom-domain automation is not included in this change; their adapters continue to use provider addresses. VPS retains its existing explicit-domain support.

Native subscription labels now include a flag and full English region name for configured two-letter country routes (plus the legacy `turkey` route). Smart is retained first. Empty or unconfigured country routes are not added. A configured route still requires an independently verified real exit; labels do not create country exits. Existing protocol support and client smart groups are unchanged; no new VPN protocol or country infrastructure is provisioned by this change. The frozen working-baseline profile remains unchanged.

## فارسی

نصب تعاملی کلودفلر، دامنه‌های در دسترس را شماره‌گذاری می‌کند؛ شمارهٔ دامنه را انتخاب کنید. زیردامنه به‌صورت پیش‌فرض نام پروژه است؛ با Enter پذیرفته می‌شود و می‌توانید نام دیگری وارد کنید. Enter یا صفر در فهرست دامنه، آدرس ارائه‌دهنده را حفظ می‌کند. مدیریت و گره‌های اتصال همان حساب آدرس مستقل می‌گیرند؛ دامنه‌های قبلی هنگام ادامهٔ نصب حفظ می‌شوند. این قابلیت دامنهٔ اختصاصی است و تضمین پنهان‌ماندن زیرساخت نمی‌دهد.

نام کشورها همراه پرچم در اشتراک بومی نمایش داده می‌شود و هوشمند اول می‌ماند. فقط مسیرهای پیکربندی‌شده اضافه می‌شوند؛ ساخت خروجی واقعی کشور، تأیید اتصال زنده و افزودن پروتکل تازه در این تغییر انجام نشده است.

Validation: TypeScript, 138 unit tests and local split integration passed. No cloud deployment or production data mutation was performed.

Pages DNS conflicts: the installer preserves existing records and selects the first available numbered hostname (for example project-2.example.com). The selected hostname is checkpointed for resume before building the address-bound artifact. Permission/provider errors remain visible; no live DNS test was performed for this change.
