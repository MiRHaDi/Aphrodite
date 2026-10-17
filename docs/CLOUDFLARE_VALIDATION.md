# Cloudflare deployment validation — 2026-10-17

Status: **final release blocked by provider enforcement and unresolved Worker execution failure**. The existing Pages application passed a live transport test, but its next deployment was explicitly rejected with Cloudflare code **8000119**: “Your Pages project has been blocked. Contact abusereply@cloudflare.com.” Further deployment attempts stopped after that response; no final release is claimed.

| Check | Result |
|---|---|
| Fresh Worker and D1 provisioning with the saved account token | Passed |
| SQL migrations and secret bindings | Passed |
| Initial private API / blank-root readiness | Passed once; later requests failed |
| Repeated Worker requests | HTTP 500, “Worker threw exception” |
| Fresh minimal control Workers | HTTP 500 with both module and classic handlers, no database or application bindings |
| Official Wrangler control deployment | Upload succeeded; its minimal handler also returned HTTP 500 |
| Restore full test application after diagnostic | Passed upload; public request still failed |
| Pages preflight, original token | HTTP 403; no resources created by that attempt |
| Pages preflight, replacement token | Passed; credential saved in Windows Credential Manager |
| Pages provisioning and upload | Fresh project and D1 created; Cloudflare reports deployment success |
| Pages default hostname | System DNS resolved to a private filtering address; direct requests timed out |
| Pages custom hostname and validated public DNS | Private API and blank-root readiness passed |
| Pages existing application transport | Temporary account, six client profiles, authenticated WebSocket → external TCP/HTTP and charged bytes passed; account disabled afterward |
| Pages subsequent deployment | Explicitly rejected as blocked, code 8000119; existing runtime test does not imply deployment eligibility |
| Local TypeScript and unit/integration fixtures | 82 tests passed |
| Local bundled Node and Miniflare transport integration | Passed |
| GUI client imports and full browser interaction | Not tested; only protocol/API and payload checks were performed |

The Worker controls narrow that failure beyond application route logic; they do not prove its precise cause or a whole-account suspension. The Pages deployment restriction is independently confirmed by the provider API. Request provider review before further deployment attempts. Existing primary services were not overwritten; temporary control Workers were removed.

A diagnostic custom hostname additionally exposed a local DNS discrepancy: system DNS resolved to an old hosting server with an expired certificate while public DNS returned Cloudflare addresses. A request using public DNS and normal certificate verification returned HTTP 522. TLS verification was not disabled for application tests. Neither result is a healthy deployment.

## Fixes included

- Require three consecutive readiness checks; reset success on any failure.
- Give an explicit permission error for Pages/Workers HTTP 401/403 before provisioning D1.
- Run Pages upload outside the checkout so an existing `wrangler.toml` cannot override the new project's bindings.
- Restrict Vitest discovery to the project test directory, excluding archived snapshots.
- Integrate client profile negotiation, isolated cache keys and configured endpoint tuples described in [CLIENT_PROFILES.md](CLIENT_PROFILES.md).
- Fall back to validated public DNS for deployment-network failures, keeping TLS verification enabled. Only the hostname is sent to the resolver, never private paths or tokens. HTTP application/provider errors do not trigger IP retries.
- Surface Cloudflare block code 8000119 without echoing raw CLI error bodies or credentials.
- Place Pages upload files in an OS temporary directory outside the checkout to avoid ancestor configuration discovery.

## Final release gate

After the live deployment is healthy, supply `TEST_DEPLOYMENT_URL`, `ADMIN_PATH`, and `ADMIN_TOKEN` through the active process environment, then run `npm run test:live`. It creates a temporary bounded native account, checks six client response formats, authenticates WebSocket, requests an external HTTP destination over TCP, verifies charged bytes and disables the temporary account. It must pass in addition to `npm run check`, `npm test`, and both `test/integration/portable_artifact.mjs` targets before a final release is claimed. This is not an ISP performance benchmark or actual GUI import test.

## فارسی

در آزمون جدید، برنامه موجود Pages با دامنه اختصاصی و DNS معتبر، API خصوصی، شش قالب اشتراک، اتصال واقعی WebSocket به TCP/HTTP و حسابداری را گذراند. حساب آزمایشی پس از آزمون غیرفعال شد. تعامل واقعی با مرورگر و ورود در برنامه‌های GUI آزمون نشده است.

استقرار بعدی Pages صریحاً با کد **8000119** و پیام مسدودشدن پروژه رد شد. از آن زمان استقرار دیگری برای دورزدن محدودیت انجام نشد. Worker تازه، حتی با کد حداقلی و ابزار رسمی Wrangler، خطای ۵۰۰ دارد؛ علت دقیق آن جداگانه تأیید نشده است. برای انتشار نهایی، بازبینی محدودیت توسط کلودفلر و آزمون مجدد هر دو مقصد لازم است.

تغییرات پروفایل‌ها و اصلاحات نصب‌کننده آزمون محلی را گذرانده‌اند، ولی این نتیجه جای آزمون زنده را نمی‌گیرد. تا گذشتن آزمون زنده، انتشار نهایی تأیید نمی‌شود.

## Fresh standalone Pages network discovery (2026-10-17)

Fresh native installations previously queried an absent external control plane for
`/api/nodes`, returning 502 despite having a native runtime. Network discovery now
includes the local runtime automatically, and includes country relays only when
routes and relay credentials are configured. The five-language sidebar reflects
these nodes rather than advertising hardcoded countries and protocols. Ready and
configured states describe configuration; they do not claim a measured connection.

83 local tests and TypeScript validation passed. An update of the existing
user-installed `aphrodite-mvbkr97p` project was rejected by Cloudflare with code
8000119 (project blocked). The corrected build has NOT reached that deployment.
No replacement project was created, and its database, bindings and administrator
credentials were not changed. Provider review is required before another upload.
