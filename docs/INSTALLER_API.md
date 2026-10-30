# Installer CLI and API

The guided CLI, JSON CLI and JavaScript API use `installer/runner.mjs`. The local HTTP API starts that same CLI in an isolated background Node process for each job. All existing provider adapters, ownership checks, database safeguards, checkpoints and provider-error handling remain in that shared path. No alternative deployment is attempted when a provider blocks a project.

## CLI for people

```sh
node installer/cli.mjs
```

The existing `install.sh` and `install.ps1` bootstrap scripts forward installer arguments. Their runtime/dependency setup has its own progress output. Use the Node CLI directly when a caller needs a strict JSON stdout contract.

## CLI for automation

```sh
node installer/cli.mjs --provider workers --name example-test --preview --no-save --non-interactive --json
```

Stdout contains one versioned JSON receipt. Stderr contains newline-delimited JSON progress events. Exit status is 0 for success and nonzero for failure. JSON mode never opens an input prompt, browser or result-page listener. `--preview` builds locally and does not provision a service; `transportVerified: false` must not be treated as a successful outbound traffic test.

Non-secret configuration files use this envelope (option names match CLI flags without `--`):

```json
{
  "options": {
    "provider": "pages",
    "name": "example-test",
    "topology": "split",
    "connections": "2",
    "connection-providers": "pages",
    "domain": "example-test.example.com",
    "zone": "ZONE_ID",
    "domain-conflict": "fail",
    "state": "/private/installer/example-test.json"
  }
}
```

Run with `--config PATH --non-interactive --json`. Provider credentials come from the existing environment names. First unattended installation requires `ADMIN_TOKEN` (at least 24 characters) and `ADMIN_PATH` (16–128 URL-safe characters). On resume the same system credential store and saved state must remain accessible. Headless hosts without an available credential store can use `--no-save` with explicit administrator credentials, but lose checkpoint recovery.

Another program can send the JSON envelope to `--config -` over stdin. This envelope may additionally contain an `environment` object with credential variables such as `CLOUDFLARE_API_TOKEN`, `ADMIN_TOKEN`, `ADMIN_PATH` and `SSH_PASSWORD`. Credentials in configuration files are rejected. Do not pass tokens as command-line arguments, commit them, or log the request body. Advanced application variables use `APHRODITE_VARIABLES` as a JSON string.

Custom domain policy is explicit for unattended jobs:

Additional saved-install options are `configure` (review choices), `subscription-id` (`opaque`, `username`, `uuid`), `wildcard-domain`, `wildcard-tls-ready` and `set-password`. Supply `ADMIN_PASSWORD` only through the environment/stdin/HTTP environment object. See [incremental installs and subscription hosts](INCREMENTAL_INSTALL.md) for recovery, password/session behavior and wildcard DNS/TLS constraints.

Cloudflare callers can specify `base-domain` (the DNS zone name) and `subdomain` separately instead of a full `domain`. Both choices are saved for interactive resume. Conflict resolution only changes a subdomain within that selected zone. MX/TXT records are preserved and are not connection targets.

| `domain-conflict` | Behavior |
|---|---|
| `reuse` | Keep the exact hostname; explicitly authorize replacing one conflicting A/AAAA/CNAME record. The prior record is saved in the installation checkpoint. Provider domain-attachment rules still apply. |
| `new` | Choose an available numbered hostname and preserve existing DNS records. |
| `fail` or omitted | Keep matching DNS; stop with `DOMAIN_DECISION_REQUIRED` for conflicting DNS. |

This policy does not move databases or user accounts. Keep existing keys, subscription paths and administrator credentials when resuming. Do not run a fresh deployment over a live service just to recover a hostname.

Results exclude administrator credentials by default. `--include-credentials` explicitly adds `credentials.administratorPath` and `credentials.administratorToken`; treat the complete result as confidential. `--resume --state PATH` continues failed provisioning. No automatic destructive cleanup is performed.

## JavaScript API

```js
import {runInstallation} from './installer/runner.mjs';

const result = await runInstallation({
  provider: 'workers', name: 'example-test', preview: true, 'no-save': true
}, {
  environment: process.env,
  onProgress(event) { /* send sanitized progress to your UI */ }
});
```

The default is noninteractive. Only one installation can run in a process at a time (`INSTALLER_BUSY`). The environment argument is scoped to preparation; it does not rewrite the caller's global environment. Use separate processes and separate state files for independent installations. Provider-specific required options still apply (for example Render plan or VPS host/fingerprint).

## Local HTTP API

Set a randomly generated `INSTALLER_API_TOKEN` of at least 32 characters in the process environment, then run:

```sh
npm run install:api
```

The server listens only on `127.0.0.1:63546` by default (`INSTALLER_API_PORT` changes the port). All endpoints require `Authorization: Bearer <INSTALLER_API_TOKEN>`. Browser Origin requests are refused; this service is intended for local trusted programs, not public hosting. It deliberately remains running until stopped. The server never opens a window or browser.

| Endpoint | Contract |
|---|---|
| `GET /v1/schema` | Versioned option types and available endpoints. |
| `POST /v1/domains` | JSON `{ "token": "PROVIDER_TOKEN", "account": "OPTIONAL_ACCOUNT_ID" }`; returns accessible zones with IDs, names and account IDs. Read-only discovery. |
| `POST /v1/jobs` | Same `options` / optional `environment` JSON envelope as stdin. Returns 202 with job ID and `statusUrl`. |
| `GET /v1/jobs/:id` | Status `running`, `succeeded` or `failed`, recent progress, and terminal JSON receipt. |

POST requests need `Content-Type: application/json`; request size is capped at 64 KiB. Only one job runs at a time (409 `INSTALLER_BUSY`). An optional `Idempotency-Key` header reuses the same job for identical requests; changed input with the same key returns 409. Keys and the most recent 20 jobs exist only in memory. A completed turn or an HTTP 202 is not an installation success: poll until terminal status and inspect `receipt.ok`.

Example using a secret already held by the calling process:

```js
const base = 'http://127.0.0.1:63546';
const headers = {
  authorization: 'Bearer ' + process.env.INSTALLER_API_TOKEN,
  'content-type': 'application/json',
  'idempotency-key': 'example-preview-1'
};
const response = await fetch(base + '/v1/jobs', {
  method: 'POST', headers,
  body: JSON.stringify({options: {
    provider: 'workers', name: 'example-test', preview: true, 'no-save': true
  }})
});
if (!response.ok) throw Error('Job submission failed: ' + response.status);
const job = await response.json();
let status;
do {
  await new Promise(resolve => setTimeout(resolve, 1000));
  status = await (await fetch(base + '/v1/jobs/' + job.id, {headers})).json();
} while (status.status === 'running');
if (!status.receipt?.ok) throw Error(status.receipt?.error?.code || 'Installation failed');
// Consume status.receipt.result without logging credentials.
```

HTTP job history and idempotency do not survive API restarts. Installation checkpoints do survive: submit a new request with `resume: true` and the same `state` path. Do not restart the API or start another installer while its child process is still provisioning. Closing an HTTP polling connection does not cancel the installation. There is no remote cancellation/automatic deletion endpoint.

## Verification scope

Tests cover the shared runner, JSON CLI preview, authenticated HTTP job lifecycle, domain discovery, idempotency, typed input, secret redaction and DNS policies. These are local/synthetic tests. No live provider deployment, production DNS change, real-user import or outbound transport verification was performed for this API change.

Local validation for this change: TypeScript check, 158 unit tests, split management/connection integration and working-baseline comparison all passed on Windows. CI also includes the API tests on Windows; the existing Linux job runs the full suite.

## فارسی

نصب تعاملی، CLI با ورودی/خروجی JSON و API جاوااسکریپت مسیر مشترک دارند. API محلی با توکن روی `127.0.0.1` اجرا می‌شود؛ برنامهٔ دیگر می‌تواند دامنه‌ها را فهرست کند، نصب را شروع کند، پیشرفت و نتیجه را بگیرد و نصب ناموفق را با همان چک‌پوینت ادامه دهد. تصمیم تداخل دامنه با `domain-conflict` مشخص می‌شود. حالت JSON بدون پرسش تعاملی است و در پایان خارج می‌شود؛ خود سرور API تا زمان توقف روشن می‌ماند. نتیجهٔ موفقِ ساخت آزمایشی، تأیید اتصال زنده نیست.
