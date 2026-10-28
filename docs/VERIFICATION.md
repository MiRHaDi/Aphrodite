# Verification guide / راهنمای آزمون

## Local checks

```sh
npm ci
npm run check
npm test
npm run test:baseline-ui
```

Unit and local runtime checks cover protocol parsing, authentication, subscription formats, accounting reservations and refunds, and baseline compatibility. The baseline integration uses independent local databases and synthetic identities.

## Live connection checks

Use `npm run test:live` with credentials supplied through the active process environment. Check panel authentication, subscription identity, TLS certificate validation and an actual HTTPS response through the connection. Repeat country and performance checks against the specific configured exits and client networks. Installer readiness covers the private API and empty root; it is a separate check from outbound traffic.

## Evidence and future work

- [Verified local build: 2026-10-28](VERIFICATION_2026-10-28.md)
- [Working source and reproducible build](WORKING_BASELINE.md)
- [Dated Cloudflare observations](CLOUDFLARE_VALIDATION.md)
- [Client format compatibility](CLIENT_PROFILES.md)
- [Development roadmap](ROADMAP.md)

Test metadata in build manifests records the scope of verification. Keep version metadata, dependency versions and historical test records accurate. A passing local check and a passing remote connection check establish different properties.

## راهنمای فارسی

تست واحد و یکپارچهٔ محلی، رفتار کد را بررسی می‌کند؛ آزمون اتصال واقعی باید پاسخ HTTPS را از مسیر کانفیگ دریافت کند. کشور خروجی و سرعت را برای همان مسیر و شبکه اندازه بگیرید. اطلاعات احراز هویت را در مخزن یا لاگ قرار ندهید. امکانات آینده در نقشهٔ راه ثبت می‌شوند و نتایج تاریخ‌دار در گزارش‌های آزمون باقی می‌مانند.
