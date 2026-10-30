# Incremental installation, login and subscription addresses

## Resume without changing settings

Saved Cloudflare Workers/Pages installations now default to **R: Resume quickly**. They reuse saved choices and credentials without repeating configuration questions. Use **E: Edit settings** or `--configure` to review and change them. An explicit `--resume` skips the initial menu. Separate state files identify separate installations; `--new` creates a fresh installation rather than upgrading a live account database.

The installer compares:

- Compiled, address-bound service code.
- Desired environment/binding values, with a stable hash rather than stored plaintext comparison values.
- Database migration contents, only for services with a database.
- Saved ownership and the actual current database binding.

A matching owned service gets a short authenticated readiness probe and no upload, bindings update, migration replay or database creation. A previously uploaded deployment with failed readiness is checked again before considering an upload. Source/configuration changes use the existing service and D1 binding. New SQL migrations run once; existing account UUIDs, subscription keys, limits, traffic and expiry are not reset. Explicit `--repair` still forces reconciliation.

Build bundles are cached locally by source/runtime/options fingerprint, with code and migration checksums. Dependency bootstrap remembers the lockfile/runtime and skips `npm ci` while its receipt and required package files remain valid. Existing connection registrations are read before writing; already registered endpoints are left alone. A management-only migration or login setting does not by itself require a database-free connector upload.

The first run after upgrading an older installer may reconcile a service once because the old checkpoint lacks complete fingerprints. Read-only provider/ownership/health checks are intentionally retained. Docker, Railway, Render and VPS keep their existing provider-specific deployment semantics; the build/dependency caches are shared, but this change does not add in-place container/SSH recovery to those adapters.

## Chosen password and random token

The first interactive installation offers an optional password (12–256 characters). The installer still creates its random administrator token. Both can sign in; setting a password does not replace the token or administrator URL. `--set-password` or **E: Edit settings** offers a password change; Enter preserves the current password.

For unattended installation/API input, pass `ADMIN_PASSWORD` through the environment or the JSON stdin/HTTP `environment` object. Never place it in a configuration file, command-line argument or Git. A saved password is represented by a salted PBKDF2-SHA256 hash; the plaintext is neither printed nor persisted. Supplying the same password again retains the same existing hash. Stored service credentials are updated only through the existing system credential store/provider secret bindings.

The current runtime's private `POST /api/session` exchanges a password or random token for an eight-hour signed browser session. Password guesses are limited to eight attempts per five-minute window per client IP, using an additive login-attempts table. The random token remains usable for API access and recovery. Changing the password revokes previously issued browser sessions without rotating the random token. Cross-origin browser login requests are rejected. The frozen offline `working-baseline` backend is unchanged and retains its token login.

## Subscription suffix

Choose during setup, **E: Edit settings**, or with:

```sh
node installer/cli.mjs --resume --subscription-id username
node installer/cli.mjs --resume --subscription-id uuid
```

| Mode | Example path |
|---|---|
| `opaque` (default) | `/<existing-random-key>` |
| `username` | `/<existing-random-key>/alice` |
| `uuid` | `/<existing-random-key>/<existing-native-uuid>` |

The existing random key remains necessary. Old opaque URLs and authorized legacy feed URLs remain accepted. A username/UUID suffix must match the account belonging to that key. Native users retain their protocol UUID; upstream users receive a stable URL alias UUID derived from their existing random key, without modifying the upstream account. Authenticated account detail and QR responses expose the currently selected URL.

## Wildcard subscription hosts

When a custom domain is selected, interactive setup can enable per-user wildcard subscriptions. Or opt in explicitly:

```sh
node installer/cli.mjs --resume --wildcard-domain example.com --subscription-id username
```

This requires an owned selected Cloudflare zone, an existing custom management hostname, and Workers Routes/DNS permissions in addition to the existing provider permissions. It installs one small subscription gateway Worker even when management is on Pages. It is a normal configured component, never a fallback for a provider block. A blocked management deployment stops before gateway provisioning.

Examples:

```text
https://alice.example.com/<existing-key>/alice
https://12345678-1234-4123-8123-123456789abc.example.com/<existing-key>/12345678-1234-4123-8123-123456789abc
```

Only valid DNS labels can be used for username hosts. Usernames containing dots/underscores, or names already reserved by existing DNS records, use a UUID host instead. If that UUID is also an existing DNS name, the primary subscription URL is retained.

The installer adds wildcard DNS plus a Worker Route and more-specific exclusions for DNS names already present. Ordinary origin hosts use no-script exclusions; Worker Custom Domains are mapped to their existing Worker service. Existing named records, MX/TXT records and existing routes are not overwritten. A wildcard record/route already belonging to another destination is refused. Management health and wildcard HTTPS are checked after routing; a newly created broad route is removed if those checks fail. Rerun the installer after adding named DNS records so the exclusion list and reserved username labels are refreshed. Existing names are protected by the recorded exclusions; this is not a background DNS watcher.

The gateway only forwards authenticated subscription GET/HEAD paths to its fixed management origin. It does not forward arbitrary URLs, panel/API paths, or VPN transport. It passes a private proof of the original hostname to management, which checks the hostname against the account owning the supplied subscription key. Unknown names, wrong-user keys and tokenless alias requests return an empty response. Merely knowing a username or UUID does not authorize subscription access. Connection-service/exit addresses and protocol authentication are unchanged.

The main custom domain is separate from the wildcard fallback. Wildcard routing does not modify the registered domain name and does not move users into a new database.

### DNS, TLS and routing limits

Cloudflare Custom Domains require exact hostnames; wildcard handling uses [Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/), including more-specific no-script exclusions. The documentation distinguishes this from [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Universal SSL covers the zone's first subdomain level. For `alice.accounts.example.com`, a certificate covering `*.accounts.example.com` is required; see [Cloudflare's wildcard TLS explanation](https://developers.cloudflare.com/sandbox/sdk/guides/preview-urls-custom-domain/). After configuring that certificate, an operator may use `--wildcard-domain accounts.example.com --wildcard-tls-ready`. The installer does not buy certificates automatically and checks HTTPS before declaring the wildcard ready.

Wildcard DNS is routing convenience, not a guarantee against filtering. Registered domains, IP addresses, TLS names and traffic behavior can still be classified or blocked. This feature does not bypass provider restrictions or automatically rotate user hostnames.

## Validation boundary

Unit/integration coverage includes no-write resume, changed-settings reconciliation, dependency/build cache reuse, saved password stability, password/session/token authentication, username/UUID/old URL compatibility, wrong-user rejection, protected DNS names, wildcard conflict refusal and local workerd execution. Tests use synthetic accounts and isolated local databases. Real Cloudflare DNS/certificates and real outbound traffic have not been tested for this change; no live user data or production service was changed.

## فارسی

ادامهٔ نصب به‌طور پیش‌فرض سریع است و تنظیمات قبلی را نگه می‌دارد؛ برای تغییر از **E** یا `--configure` استفاده کنید. سرویس ذخیره‌شدهٔ Workers/Pages که کد، تنظیمات و مهاجرتش یکسان باشد دوباره آپلود نمی‌شود. رمز انتخابی در کنار توکن تصادفی فعال است؛ رمز خام ذخیره یا نمایش داده نمی‌شود. نام کاربر یا UUID می‌تواند آخر لینک بیاید، ولی کلید معتبر همچنان لازم است. wildcard برای زیردامنه‌های کاربران اختیاری است و نام‌های DNS موجود را حفظ می‌کند؛ به‌تنهایی تضمین جلوگیری از فیلتر نیست. زیرشاخه‌های عمیق‌تر به گواهی TLS متناسب نیاز دارند.

Validation receipt: TypeScript and 180 unit tests passed locally on Windows. Synthetic Node and local workerd feature integrations, minified Node/Workers transport checks, split-role integration and the frozen-baseline comparison passed. This is not a live Cloudflare DNS or outbound Internet deployment test.
