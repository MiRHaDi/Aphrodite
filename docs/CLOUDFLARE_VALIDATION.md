# Cloudflare deployment validation — 2026-10-17

## Legacy account data recovery (2026-10-17)

After the existing `smart` hostname was moved to the standalone Pages project,
legacy subscriptions returned 404 because its separate database contained only
disabled diagnostic accounts. Both databases were encrypted into local recovery
snapshots before migration. The original database was left unchanged.

The destination now contains all 115 original subscription keys, routes and raw
legacy data, including original proxy/country metadata. The 112 complete legacy
profiles were projected into native accounts with the same UUIDs and subscription
keys, original consumption/request counters, expiration and restrictive limits.
Existing destination accounts were preserved. Six compatible HTTP/SOCKS proxy
entries per profile are usable by the native schema; the remaining WSS entry is
archived intact in the original profiles, not interpreted as an HTTP proxy. Native
VLESS projection does not claim restored Trojan/Shadowsocks or country routing.

All 112 opaque subscriptions returned HTTP 200 and contained their original UUID.
Six client formats for `iust` returned 200 with matching quota and expiration
headers. The existing `/feed/iust?token=...` also returned 200. The unchanged bare
`/feed/iust` still returns 404: the deployed private handler authorizes the legacy
name but fails to supply its existing key internally to the native renderer.
The source correction now forwards that stored key only after legacy permission
has been checked; token-only users and invalid explicit tokens remain denied.
This correction is not deployed because the project remains upload-blocked.

An edge redirect compatibility layer could preserve the original bare URLs while
the source deployment is blocked. Current account list/ruleset API calls return
403; enabling it requires Account Bulk URL Redirects Edit and Account Filter
Lists Edit. No redirect rule has been installed or claimed active.

Three route-only accounts (`mirhadi-family`, `miLaD`, `mehdi_khorasani`) retain
their exact keys/routes/policies but have no complete identity profile in any of
the account's D1 databases. Their previous service hostname returns 404, and the
authenticated Railway project listing is empty. No replacement UUID or guessed
usage/expiration was generated. Their subscriptions and live TCP functionality
remain unverified/unrestored.

## Existing Pages outbound investigation (2026-10-17, follow-up)

The unchanged `aphrodite-check-pages-1792175765` production deployment from
2026-10-16 18:36 UTC was tested again through its existing custom domain. Private
panel/authentication, bounded account creation and six subscription profiles passed.
An authenticated VLESS DNS session returned a real DNS answer (2-byte protocol
acknowledgement plus 48 response bytes); accounting recorded 80 bytes and two
requests across DNS/TCP tests. TCP to a public non-Cloudflare test destination
closed with WebSocket 1008 before a protocol acknowledgement. Its invocation tail
reported `ok` with no uncaught exceptions: the application catches and hides the
underlying connection error. The exact TCP cause is therefore not confirmed.

Diagnostic accounts were disabled and the temporary log subscriptions removed.
An encrypted local recovery snapshot includes project configuration and D1 data.
No existing account credentials, settings or bindings were changed.

The standard Pages Functions entry now uses the direct-socket entry rather than
the relay-only entry. This fixes that installation path; it is not evidence that
the active portable bundle lacked a socket factory. Transport failures now log
only a fixed phase and category, without raw exceptions or user/destination data.

A single corrective upload to the **same project** was rejected with code
8000119. Configuration and the production deployment ID were unchanged afterward.
The changes are prepared and locally tested, but have not reached the live
deployment. Provider review remains necessary; no replacement project was created.

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
