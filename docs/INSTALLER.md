# Portable installer

Current live validation and final-release blockers: [Cloudflare validation](CLOUDFLARE_VALIDATION.md). Client negotiation details: [Client profiles](CLIENT_PROFILES.md).

For deployment-network failures the installer can resolve the public hostname using Google's HTTPS DNS endpoint at 8.8.8.8. It preserves hostname/SNI and normal certificate verification; private paths, tokens and request headers are not sent to DNS. HTTP errors are returned without trying other IPs. Cloudflare block code 8000119 stops deployment and requires provider review.

Extract the source package and run `./install.ps1 --provider workers` in PowerShell, or `bash install.sh --provider pages` on Linux/macOS. The bootstrap downloads official Node 24 with SHA256 verification and installs locked dependencies. Existing Node users can run `node installer/cli.mjs`. Provider tokens are entered with visible input; generated administrator credentials are printed once in an interactive terminal. No additional windows are opened.

Providers: `workers`, `pages`, `railway`, `render`, `docker`, `vps`, `bundle`. Use `--preview` for a build without provider mutations or credentials. Separate complete installations have independent accounting; connection nodes within a split installation share its central ledger.

- Workers/Pages provision one central D1 database and apply migrations, or reuse the compatible database supplied by --database-id. Supply the appropriate Workers/Pages and D1 permissions; use `--account ID` for multiple accounts. Optional `--domain HOST --zone ID` requires domain/DNS permissions. Existing Pages DNS records are not overwritten.
- Railway provisions a service, persistent volume, variables and domain. An account token can create a project; project tokens require `--project-token --project ID --environment ID`. The official CLI archive must have a verifiable GitHub SHA256 digest.
- Render requires `--plan starter` or another paid disk-capable plan, repository access and optionally `--owner ID`. It creates a single Docker instance with persistent `/data`; free plans are rejected. Default repository is `MiRHaDi/Aphrodite`, branch `main`; override with `--repo` and `--branch`.
- Docker requires a running daemon. The installer does not silently install or launch Docker Desktop. The service binds to localhost and uses a persistent volume, a non-root user and restricted capabilities.
- VPS requires `--host HOST --user USER --fingerprint SHA256:VALUE` plus `--key PATH` or a prompted password. Verify the fingerprint independently. Root or passwordless sudo can install Docker and Python on Debian/Ubuntu. Optional `--domain HOST` enables Caddy HTTPS after you configure DNS. Otherwise use an SSH tunnel. This installs application software on the server.
- Other hosts can consume the Docker image or `bundle` output if they support Node 24, WebSocket upgrades and persistent storage. Arbitrary providers do not have automatic API adapters.

Unattended deployments require process environment variables `ADMIN_TOKEN` (24+ characters) and `ADMIN_PATH` (16–128 letters/digits/underscore/hyphen). Provider secrets: `CLOUDFLARE_API_TOKEN`, `RAILWAY_API_TOKEN`, project `RAILWAY_TOKEN`, `RENDER_API_KEY`, SSH `SSH_PASSWORD`. `--token-env NAME` overrides the provider token variable. Do not commit or write secrets into files. Provider and Docker administrators can inspect service environment variables. Advanced string settings use JSON in `APHRODITE_VARIABLES`. Manual Compose builds additionally require a nonsecret `APHRODITE_BUILD_NONCE` for cache invalidation.

Owned JavaScript and UI scripts are bundled/minified with esbuild. Random build IDs do not imply different code hashes. No dead-code polymorphism or mechanisms to evade provider detection are included. Minification is not encryption or a promise against suspension. SQL, configuration, licenses and system tools remain readable.

The portable runtime supports VLESS over WebSocket, TCP forwarding and UDP DNS. The supplied archives contained deployment recipes rather than Reality/AnyTLS/MTProto/WireGuard/OpenVPN engine source; those engines are not implemented here. Standalone Node SQLite is single-instance; split Cloudflare connection nodes use the central ledger.

Local Node and Miniflare integration tests exercise private management, account creation, opaque subscriptions, subscription formats, authenticated WebSocket and quota reservation/refund. Provider API tests are mocked. Live Cloudflare/Railway/Render/SSH installations have not been verified by this package. CLI `verified` means private API and empty-root readiness only, not outbound connectivity or performance across ISPs.

Existing service names are refused. Failed provisioning can leave new resources; automatic rollback, upgrades and resume are not implemented. Preserve database backups before removing disks/volumes. Provider resources may incur charges.

Official references: [Workers upload](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/), [Pages upload](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/), [Railway API](https://docs.railway.com/integrations/api/api-cookbook), [Render Docker](https://render.com/docs/docker).

## Split Cloudflare default

Workers/Pages installs now default to one management service and two database-free
connection services, alternating Workers and Pages. Use `--connections 1..8` and
`--connection-providers workers,pages` to choose the pool. The central D1 shares
accounting across all nodes. The default requires Workers Scripts Edit, Cloudflare
Pages Edit and D1 Edit. `--topology standalone` explicitly retains the older
single-service behavior. Other providers remain standalone.

`--database-id UUID` reuses compatible existing central D1 without replaying
migrations or rewriting user records. It does not overwrite an existing service
or DNS. Preserve the old subscription hostname and key tables during a reviewed
cutover. Provider blocks must be resolved before live deployment. See
[architecture and migration limits](ARCHITECTURE.md).

## Token entry and clickable results

The Cloudflare token-creation link is printed before the token prompt. Provider
API tokens are visible while typed and require one Enter; SSH passwords remain
hidden. The wizard reuses one readline interface across consecutive prompts.
Interactive results use terminal hyperlinks where supported, with ordinary URL
fallbacks. A random loopback-only HTTP result page offers clickable management and
connection links and a button to copy the administrator token. It stores no file,
loads no external assets and expires after 10 minutes or when the installer is
closed. Clipboard support depends on browser permission; if blocked, the token is
selected for Ctrl+C. The terminal stays running while this local page is available;
Ctrl+C closes it. Neither a browser nor a new console is opened automatically.
# Live installation progress


Builds, database operations, uploads and readiness checks report timestamped status and results. Long deployment operations emit elapsed-time updates at most every thirty seconds. Bootstrap downloads show download progress; dependency installation also emits waiting updates. These messages do not claim a percentage or verified outbound connectivity.

Compatible terminals display cyan clickable links, yellow token prompts/results, green success, yellow waiting and red failure messages. The private local result page provides the token-copy button. Progress excludes API credentials, private request URLs and raw deployment-tool output. `NO_COLOR` disables terminal styling; plain URLs remain visible.



## English-only installer and sequential logs

The installer, prompts and local result page use English only; there is no language menu, RTL setting or shaping dependency. The application panel keeps its five languages. Bootstrap messages use [BOOTSTRAP] rather than misleading fixed step totals, including when Node is cached. The destination menu uses A-G. Every installation event shares one increasing counter, including start, completion, waiting and error events. Logs describe bundles and sizes, provider API operations and HTTP statuses, database creation or reuse and migrations, uploads, process exit codes, readiness results and retry delays. Long operations report elapsed time at most every thirty seconds. API credentials, private API paths, request bodies and raw tool output are excluded from progress logs.

## Resume and add Cloudflare accounts

Interactive Cloudflare installation saves non-secret choices, service identities, database IDs and completed stages under the current user's Aphrodite installer state directory. On Windows this defaults to `%LOCALAPPDATA%/Aphrodite/installer/installation.json`; on Linux it uses `XDG_STATE_HOME` or `~/.local/state`. Provider tokens, administrator credentials and shared machine keys go into Windows Credential Manager, macOS Keychain or Linux Secret Service (`secret-tool` with a running/unlocked service). They are not written into the checkpoint file. Keep the same operating-system user when resuming. On systems without a supported credential store, use `--no-save` with your own `ADMIN_TOKEN` and `ADMIN_PATH`; that mode does not save a resumable deployment.

Rerun the one-line installer: choose Resume, Add account, or New. Saved choices are defaults; Enter keeps a saved token and a replacement can be pasted. A new installation archives the previous metadata. Management name/account changes require New; adding a different account uses Add account and preserves the existing control plane and users. Old installer versions did not create checkpoints, so their existing resources cannot be automatically adopted by this mechanism.

```sh
node installer/cli.mjs --resume
node installer/cli.mjs --resume --repair
node installer/cli.mjs --resume --add-account --connection-account ACCOUNT_ID --connection-token-env CF_SECOND --connections 2 --connection-providers workers,pages
```

Supply `CF_SECOND` in the current process environment, or paste the additional token interactively. Each account profile supports 1-8 connection services, up to 64 total per installation. Names stay stable across reruns. The management service owns D1; connection accounts receive restricted accounting credentials. Only connections that pass readiness are appended to the persistent central subscription registry. Existing users, quota accounting and subscription links stay on the central service. Completed unchanged services are checked without a new upload; `--repair` rebuilds owned services. Ownership markers prevent overwriting an unrelated Worker or Pages project, and mismatching database bindings stop recovery rather than replacing user data. Cloudflare checkpoints and multi-account connection deployment apply to Workers/Pages; the other destinations remain standalone.

Interactive waits use an ASCII spinner and elapsed time on one line. Repeated unchanged status is printed no more often than every 30 seconds; changed status and completed operations appear immediately. Redirected output omits animation. PowerShell prints friendly stop/recovery messages instead of a throw stack. Health checks recognize Cloudflare 1101/1102, 1010 and 1027 and stop with an actionable diagnosis instead of repeating the same response for two minutes. Authentication, database schema, application API readiness and root privacy checks still determine success; a spinner is not proof of connectivity.

### Per-service address restriction
Before upload, each Cloudflare artifact is bound to its exact service hostname and configured custom domain. Other hosts (including Pages preview aliases) return an empty 404 before application execution. Adding a domain requires rebuilding with that domain configured. The restriction is embedded in the minified server bundle, not selected by client headers. It is not DRM: an administrator with source/deployment access can modify or remove it. Server source is not a public asset; browser-delivered assets remain inspectable. No polymorphic signature evasion is used.
