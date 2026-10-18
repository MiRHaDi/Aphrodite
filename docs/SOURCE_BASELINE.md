# Working source reference / سورس مرجع سالم

The repository includes the pinned source reference used to reproduce the working runtime in [`baseline/working`](../baseline/working). It contains source files and migrations, without user databases or deployment credentials. This is a checked-in source snapshot, not a fresh source export from a running Pages deployment.

- Source commit: `f0be266977ac173c3212c39fef34f34dbda2009f`
- Reference artifact SHA-256: `2c5cd1f776e3e2e92292170df8b53092961aa6368da1f6cd46b4bf1e3495e06e`
- Per-file checksums: [`snapshot.json`](../baseline/working/snapshot.json)
- Build and test instructions: [Working baseline](WORKING_BASELINE.md)

```sh
npm ci
npm run build:baseline-ui
npm run test:baseline-ui
```

The candidate overlays the current panel, translations and font on the reference backend. The reference source remains unchanged. New backend features require separate integration and validation. Local test results do not establish remote deployment readiness.

سورس مرجع اتصال سالم همراه مخزن موجود است و checksum تک‌تک فایل‌ها کنترل می‌شود. این بسته، خروجی تازه از سرویس زنده نیست؛ داده و تنظیمات خصوصی کاربران را شامل نمی‌شود. رابط جدید روی backend مرجع ساخته می‌شود و افزودن قابلیت‌های backend باید جداگانه تست شود.
