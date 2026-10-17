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

Builds, database operations, uploads and readiness checks report timestamped status and results. Long deployment operations emit elapsed-time updates every five seconds. Bootstrap downloads show download progress; dependency installation also emits waiting updates. These messages do not claim a percentage or verified outbound connectivity.

Compatible terminals display cyan clickable links, yellow token prompts/results, green success, yellow waiting and red failure messages. The private local result page provides the token-copy button. Progress excludes API credentials, private request URLs and raw deployment-tool output. `NO_COLOR` disables terminal styling; plain URLs remain visible.

Persian terminal output uses contextual glyph shaping and Unicode bidi reordering in interactive Windows consoles by default, with logical word wrapping before conversion. PowerShell console output uses UTF-8. `APHRODITE_RTL=native` disables conversion for terminals that already implement bidi; `visual` forces compatibility mode on other systems, and `auto` restores the default. Redirected logs retain logical Unicode order. Credentials, URL payloads and browser HTML are not reordered. Use a font with Persian glyph coverage. Pre-dependency bootstrap messages remain in English.

