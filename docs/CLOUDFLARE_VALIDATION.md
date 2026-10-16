# Cloudflare deployment validation — 2026-10-16

Status: **final release blocked**. This records a live installation attempt, not a successful production deployment.

| Check | Result |
|---|---|
| Fresh Worker and D1 provisioning with the saved account token | Passed |
| SQL migrations and secret bindings | Passed |
| Initial private API / blank-root readiness | Passed once; later requests failed |
| Repeated Worker requests | HTTP 500, “Worker threw exception” |
| Minimal control program returning an empty response | Also HTTP 500 on the same test Worker |
| Restore full test application after diagnostic | Passed upload; public request still failed |
| Pages preflight, original token | HTTP 403; no resources created by that attempt |
| Pages preflight, replacement token | Passed; credential saved in Windows Credential Manager |
| Pages provisioning and upload | Fresh project and D1 created; Cloudflare reports deployment success |
| Pages public readiness | Failed; requests timed out from the test network; no healthy deployment claimed |
| Local TypeScript and unit/integration fixtures | 77 tests passed |
| Local bundled Node and Miniflare transport integration | Passed |
| Live account creation, client imports and outbound transport | Not verified; public deployment did not pass readiness |

The minimal control narrows the problem beyond application route logic; it does not establish an account suspension or a specific Cloudflare root cause. Inspect account/platform status before further deployment attempts. Existing services were not overwritten.

A diagnostic custom hostname additionally exposed a local DNS discrepancy: system DNS resolved to an old hosting server with an expired certificate while public DNS returned Cloudflare addresses. A request using public DNS and normal certificate verification returned HTTP 522. TLS verification was not disabled for application tests. Neither result is a healthy deployment.

## Fixes included

- Require three consecutive readiness checks; reset success on any failure.
- Give an explicit permission error for Pages/Workers HTTP 401/403 before provisioning D1.
- Run Pages upload outside the checkout so an existing `wrangler.toml` cannot override the new project's bindings.
- Restrict Vitest discovery to the project test directory, excluding archived snapshots.
- Integrate client profile negotiation, isolated cache keys and configured endpoint tuples described in [CLIENT_PROFILES.md](CLIENT_PROFILES.md).

## Final release gate

After the live deployment is healthy, supply `TEST_DEPLOYMENT_URL`, `ADMIN_PATH`, and `ADMIN_TOKEN` through the active process environment, then run `npm run test:live`. It creates a temporary bounded native account, checks six client response formats, authenticates WebSocket, requests an external HTTP destination over TCP, verifies charged bytes and disables the temporary account. It must pass in addition to `npm run check`, `npm test`, and both `test/integration/portable_artifact.mjs` targets before a final release is claimed. This is not an ISP performance benchmark or actual GUI import test.

## فارسی

نصب واقعی Worker و D1 انجام شد، اما پس از موفقیت اولیه، درخواست‌های بعدی خطای ۵۰۰ دادند. برنامه حداقلی پاسخ خالی هم همین خطا را داشت؛ علت قطعی مشخص نشده است. توکن جایگزین مجوز Pages دارد و پروژه و دیتابیس تازه و استقرار Pages ساخته شدند، ولی آزمون دسترسی عمومی از این شبکه موفق نشد. اختلاف DNS سیستم با DNS عمومی نیز جداگانه مشاهده شد.

تغییرات پروفایل‌ها و اصلاحات نصب‌کننده آزمون محلی را گذرانده‌اند، ولی این نتیجه جای آزمون زنده را نمی‌گیرد. تا گذشتن آزمون زنده، انتشار نهایی تأیید نمی‌شود.
