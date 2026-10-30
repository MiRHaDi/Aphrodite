# Custom domains and country labels

On a fresh interactive Cloudflare installation, after token entry the installer lists accessible DNS zones by number. Select a number, then accept the project name as the default subdomain or enter a different subdomain. Enter or 0 at the domain list keeps the provider hostname. Domain discovery requires Zone Read permission; existing DNS/domain setup requires the existing provider permissions. Unattended installs can supply `--domain panel.example.com --zone ZONE_ID`.

Domain and subdomain are separate choices on interactive resume too. A saved zone is the default numbered choice; the saved subdomain is the editable default in the next prompt. Enter accepts each existing choice; 0 at the domain menu explicitly selects the provider hostname. For automation, `--base-domain example.com --subdomain panel` resolves both parts without a prompt; `--domain panel.example.com` remains supported. `@` explicitly selects the zone root, and is shown for a saved root hostname.

Conflict alternatives stay inside the authoritative DNS zone, including domains such as `example.co.uk`. A root conflict at `example.com` chooses `PROJECT.example.com` before trying `PROJECT-2.example.com`; it never invents `example-2.com`. Existing subdomains are numbered within that same zone. The final management hostname is checkpointed and used as the base for connection-service hostnames. Explicitly changed choices take precedence over an older per-service hostname.

Only A, AAAA and CNAME values appear as service address records in the conflict prompt. MX/TXT and other records are neither treated as connection targets nor deleted. Creating/replacing a CNAME over a mixed or mail-only record set is refused; select a separate subdomain instead.

In split installations the management service uses that hostname. Same-account connection services receive `connect-primary-1.panel.example.com`, `connect-primary-2.panel.example.com`, etc. Additional accounts retain provider hostnames: a zone is never silently reused across accounts. Existing domain and certificate verification uses the provider adapter. Conflicting Pages DNS records are not overwritten. Resume keeps saved domain choices.

These are normal provider-supported custom domains. They do not guarantee infrastructure anonymity, remove provider endpoints, or bypass provider restrictions. Railway and Render custom-domain automation is not included in this change; their adapters continue to use provider addresses. VPS retains its existing explicit-domain support.

Native subscription labels now include a flag and full English region name for configured two-letter country routes (plus the legacy `turkey` route). Smart is retained first. Empty or unconfigured country routes are not added. A configured route still requires an independently verified real exit; labels do not create country exits. Existing protocol support and client smart groups are unchanged; no new VPN protocol or country infrastructure is provisioned by this change. The frozen working-baseline profile remains unchanged.

## فارسی

نصب تعاملی کلودفلر، دامنه‌های در دسترس را شماره‌گذاری می‌کند؛ شمارهٔ دامنه را انتخاب کنید. زیردامنه به‌صورت پیش‌فرض نام پروژه است؛ با Enter پذیرفته می‌شود و می‌توانید نام دیگری وارد کنید. Enter یا صفر در فهرست دامنه، آدرس ارائه‌دهنده را حفظ می‌کند. مدیریت و گره‌های اتصال همان حساب آدرس مستقل می‌گیرند؛ دامنه‌های قبلی هنگام ادامهٔ نصب حفظ می‌شوند. این قابلیت دامنهٔ اختصاصی است و تضمین پنهان‌ماندن زیرساخت نمی‌دهد.

نام کشورها همراه پرچم در اشتراک بومی نمایش داده می‌شود و هوشمند اول می‌ماند. فقط مسیرهای پیکربندی‌شده اضافه می‌شوند؛ ساخت خروجی واقعی کشور، تأیید اتصال زنده و افزودن پروتکل تازه در این تغییر انجام نشده است.

Validation: TypeScript, 138 unit tests and local split integration passed. No cloud deployment or production data mutation was performed.

Existing Pages hostnames: interactive installation shows the current DNS target and asks whether to reuse the exact hostname (explicitly enter 1 to replace a different target) or select an available numbered hostname, for example project-2.example.com. Matching CNAMEs are left untouched. Replacing a single A, AAAA or CNAME record requires the reuse choice; its previous record is checkpointed before replacement, and the installer refuses replacement if DNS changes after confirmation. Multiple/non-address records are preserved. Unattended conflicting DNS requires an interactive decision. The chosen hostname is checkpointed before building the address-bound artifact. Provider-side attachment conflicts and permission errors remain visible; no live DNS test was performed for this change. Keeping the hostname preserves that portion of subscription links; existing account keys and paths must also remain unchanged.

اگر زیردامنه قبلاً تنظیم شده باشد، مقصد فعلی نشان داده می‌شود: گزینهٔ ۱ استفاده از همان آدرس و گزینهٔ ۲ انتخاب آدرس شماره‌دار آزاد است. رکورد مطابق تغییر نمی‌کند؛ تغییر مقصد یک رکورد آدرس فقط پس از انتخاب گزینهٔ ۱ انجام می‌شود. اطلاعات قبلی رکورد در وضعیت نصب حفظ می‌شود. این کار به‌تنهایی کلید یا مسیر اشتراک کاربران را مهاجرت نمی‌دهد.

Validation of separate domain/subdomain selection: TypeScript and 167 tests passed locally. Root-domain and multi-label-zone conflict cases, mail-record preservation, editable saved defaults and final connection-host derivation are covered. No live DNS changes were made.
