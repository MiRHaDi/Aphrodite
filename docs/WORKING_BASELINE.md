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

Use a clone containing the pinned commit (shallow checkouts may need that history)
and the repository's installed dependencies:

```bash
npm run build:baseline-ui
npm run test:baseline-ui
```

The output is `.artifacts/working-baseline-ui/worker.mjs` with a manifest stating
`remoteDeploymentTested: false`. No provider API or deployment command is called.
The comparison test uses two isolated local D1 databases with synthetic accounts.
It checks private panel access, authentication, all five language choices,
subscription identity/ports, native protocol acknowledgement, byte reservation and
refund, and preservation of keys, expiry and account settings.

## Promotion gate / شرط انتشار

A passing local test is not proof of a working remote TCP connection. Do not
replace the live service or release this as remotely verified. Provider deployment
restrictions must first be resolved through the provider. After that, independently
test the candidate with a separate test database and synthetic credentials, including
real end-to-end HTTPS traffic, before considering any production update. Never
attach the live user database to the test deployment.

موفقیت تست محلی به معنی تأیید اتصال واقعی روی Cloudflare نیست. تا رفع رسمی
محدودیت انتشار و آزمون مستقل با دیتابیس آزمایشی، سرویس سالم جایگزین نمی‌شود.
