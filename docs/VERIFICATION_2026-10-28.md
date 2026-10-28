# Verified local build — 2026-10-28

Source revision: `fb9d57ec75bc877f79da9ca566a7cacd9f5cdfcb`.

The following checks completed successfully on Windows:

| Check | Result |
| --- | --- |
| `npm run check` | TypeScript passed |
| `npm test -- --maxWorkers=2 --testTimeout=15000` | 30 files, 133 tests passed |
| `npm run build:baseline-ui` | Reference artifact reproduced exactly |
| `npm run test:baseline-ui` | Local integration passed |

The first unrestricted test run reached the default five-second timeout in two installer tests (131 passed). The bounded-worker run above passed all 133 tests; no application code or assertions were changed.

## Artifact identity

- Build ID: `baseline-ui-a2e66a8c3f2c270d`
- SHA-256: `a2e66a8c3f2c270d6d6aeadbc93554dda51881cb03b2ecda7023d7bb3d11b66a`
- Size: 489,994 bytes; gzip: 205,506 bytes
- Reference commit: `f0be266977ac173c3212c39fef34f34dbda2009f`
- Reference SHA-256: `2c5cd1f776e3e2e92292170df8b53092961aa6368da1f6cd46b4bf1e3495e06e`

The integration verifies five languages, private panel access, authentication, subscriptions, existing identities, native protocol acknowledgement, quota reservation/refund, and unchanged expiry using independent local databases and synthetic accounts. This candidate overlays panel UI files on the preserved backend; it does not add new backend features.

Reproduce with the commands in [CONTINUITY.md](../CONTINUITY.md). The generated bundle is under `.artifacts/working-baseline-ui`; build metadata preserves its verification scope. No production deployment, live traffic validation, user migration, or provider approval is claimed by this record. No live data, bindings, credentials, or subscription links were changed for these checks.

## فارسی

نسخهٔ بالا در بررسی TypeScript، هر ۱۳۳ تست و آزمون یکپارچهٔ محلی موفق بود. بستهٔ مرجع دقیقاً بازتولید شد. این نتیجه مربوط به آزمون محلی با کاربران ساختگی و دیتابیس‌های مستقل است؛ تأیید استقرار یا اتصال زنده نیست. سرویس فعال و اطلاعات کاربران تغییری نکرده‌اند.
