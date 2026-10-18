# Working connection baseline / مبنای اتصال سالم

This is an **offline candidate**, not a production deployment or release. Existing
Workers, Pages, DNS records, bindings, databases and user credentials are untouched.

این نسخه فقط برای ساخت و آزمایش محلی است؛ هنوز روی Cloudflare منتشر نشده است.
هیچ تنظیم یا اطلاعاتی از سرویس فعال را تغییر نمی‌دهد.

## Reproduce first

The build pins source commit `f0be266977ac173c3212c39fef34f34dbda2009f` and first
reproduces the exact known-working artifact SHA-256:

```text
2c5cd1f776e3e2e92292170df8b53092961aa6368da1f6cd46b4bf1e3495e06e
```

Any mismatch stops the build. The candidate overlays only `src/panel.ts`,
`src/panel-i18n.ts` and `src/panel-font.ts` from the current checkout. Transport,
accounting, subscriptions and authentication all come from the pinned baseline.
This intentionally does not backport newer backend fixes or country routing.
It is not the default installer, whose split deployment remains unchanged.

## Local commands

The byte-verified source snapshot is included in `baseline/working`, so archive
downloads and shallow clones need no Git history. Install the locked dependencies:

```bash
npm run build:baseline-ui
npm run test:baseline-ui
node installer/cli.mjs --provider bundle --build-profile working-baseline --preview --no-save
```

The output includes the worker, pinned migrations, licenses and a manifest under
`.artifacts/working-baseline-ui`, with the manifest stating
`remoteDeploymentTested: false`. No provider API or deployment command is called.
The comparison test uses two isolated local D1 databases with synthetic accounts.
It checks private panel access, authentication, all five language choices,
subscription identity/ports, native protocol acknowledgement, byte reservation and
refund, and preservation of keys, expiry and account settings.

The installer accepts this profile only for offline bundles or preview, with
standalone topology. Its regular default remains split deployment. The source
snapshot has per-file SHA-256 checksums and preserves exact bytes on Windows.
CI runs the comparison on Windows and Linux and publishes a downloadable artifact
with the verification manifest. These are local/emulated tests, not remote tests.

نسخهٔ مرجع همراه پروژه است؛ دریافت ZIP هم برای ساخت آن کافی است و به تاریخچهٔ
Git نیاز ندارد. دستور سوم خروجی کامل را بدون توکن و بدون تغییر منابع ابری می‌سازد.
آزمون‌های CI روی ویندوز و لینوکس اجرا می‌شوند و بستهٔ خروجی قابل دریافت است.

## Promotion gate / شرط انتشار

A passing local test is not proof of a working remote TCP connection. Do not
replace the live service or release this as remotely verified. Provider deployment
restrictions must first be resolved through the provider. After that, independently
test the candidate with a separate test database and synthetic credentials, including
real end-to-end HTTPS traffic, before considering any production update. Never
attach the live user database to the test deployment.

موفقیت تست محلی به معنی تأیید اتصال واقعی روی Cloudflare نیست. تا رفع رسمی
محدودیت انتشار و آزمون مستقل با دیتابیس آزمایشی، سرویس سالم جایگزین نمی‌شود.
