# Development roadmap / برنامهٔ توسعه

Updated: 2026-10-18. This is a plan, not a claim that every feature is available.

| Priority | Work | Acceptance criteria |
|---|---|---|
| 1 | Preserve the working connection baseline | Reproducible checksums; isolated comparison tests; no changes to live identities, quotas or subscriptions |
| 1 | Incremental backend integration | One feature per change; authentication, accounting and compatibility tests pass |
| 2 | Country selection and smart routing | Real exit country verified; destination access tested; unavailable exits excluded |
| 2 | Iranian destinations from outside Iran | Verified Iranian exit and end-to-end destination tests; no assumption that client-direct routing provides an Iranian exit |
| 2 | Client profile compatibility | Valid geoip/geosite sections and import tests in supported clients |
| 3 | Resumable installation | Saved non-secret selections; recoverable errors; explicit credential handling and clear progress |
| 3 | Multiple nodes and accounts | Aggregated subscriptions with preserved account identity and tested accounting |
| 3 | Performance | Measured connection time, latency, jitter and throughput before and after each change |
| 4 | Production release | Independent runtime validation, recoverable backup, preserved bindings and documented rollback |

## قواعد اجرا

- مبنای اتصال سالم در `baseline/working` باقی بماند؛ تغییرات روی نسخهٔ کاندید انجام شوند.
- دیتابیس تست از کاربران واقعی جدا باشد؛ رمز و کلید وارد Git یا لاگ نشود.
- قابلیت‌ها با نتیجهٔ آزمون معرفی شوند؛ برنامهٔ آینده را قابلیت آماده معرفی نکنید.
- برای هر تغییر، آزمون محلی و اتصال واقعی و وضعیت انتشار جدا ثبت شوند.
- [حافظهٔ پروژه](../PROJECT_MEMORY.md)، [مسیر توسعه](../PROJECT_JOURNEY.md) و [راهنمای ادامه](../CONTINUITY.md) نقطهٔ شروع جلسات بعدی هستند.
