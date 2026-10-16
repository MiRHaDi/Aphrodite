# Portable installer

Current live validation and final-release blockers: [Cloudflare validation](CLOUDFLARE_VALIDATION.md). Client negotiation details: [Client profiles](CLIENT_PROFILES.md).

Extract the source package and run `./install.ps1 --provider workers` in PowerShell, or `bash install.sh --provider pages` on Linux/macOS. The bootstrap downloads official Node 24 with SHA256 verification and installs locked dependencies. Existing Node users can run `node installer/cli.mjs`. Tokens are entered with hidden input; generated administrator credentials are printed once in an interactive terminal. No additional windows are opened.

Providers: `workers`, `pages`, `railway`, `render`, `docker`, `vps`, `bundle`. Use `--preview` for a build without provider mutations or credentials. Every installation has independent accounting; installations do not share quotas.

- Workers/Pages provision fresh D1 databases and apply migrations. Supply the appropriate Workers/Pages and D1 permissions; use `--account ID` for multiple accounts. Optional `--domain HOST --zone ID` requires domain/DNS permissions. Existing Pages DNS records are not overwritten.
- Railway provisions a service, persistent volume, variables and domain. An account token can create a project; project tokens require `--project-token --project ID --environment ID`. The official CLI archive must have a verifiable GitHub SHA256 digest.
- Render requires `--plan starter` or another paid disk-capable plan, repository access and optionally `--owner ID`. It creates a single Docker instance with persistent `/data`; free plans are rejected. Default repository is `MiRHaDi/Aphrodite`, branch `main`; override with `--repo` and `--branch`.
- Docker requires a running daemon. The installer does not silently install or launch Docker Desktop. The service binds to localhost and uses a persistent volume, a non-root user and restricted capabilities.
- VPS requires `--host HOST --user USER --fingerprint SHA256:VALUE` plus `--key PATH` or a prompted password. Verify the fingerprint independently. Root or passwordless sudo can install Docker and Python on Debian/Ubuntu. Optional `--domain HOST` enables Caddy HTTPS after you configure DNS. Otherwise use an SSH tunnel. This installs application software on the server.
- Other hosts can consume the Docker image or `bundle` output if they support Node 24, WebSocket upgrades and persistent storage. Arbitrary providers do not have automatic API adapters.

Unattended deployments require process environment variables `ADMIN_TOKEN` (24+ characters) and `ADMIN_PATH` (16–128 letters/digits/underscore/hyphen). Provider secrets: `CLOUDFLARE_API_TOKEN`, `RAILWAY_API_TOKEN`, project `RAILWAY_TOKEN`, `RENDER_API_KEY`, SSH `SSH_PASSWORD`. `--token-env NAME` overrides the provider token variable. Do not commit or write secrets into files. Provider and Docker administrators can inspect service environment variables. Advanced string settings use JSON in `APHRODITE_VARIABLES`. Manual Compose builds additionally require a nonsecret `APHRODITE_BUILD_NONCE` for cache invalidation.

Owned JavaScript and UI scripts are bundled/minified with esbuild. Random build IDs do not imply different code hashes. No dead-code polymorphism or mechanisms to evade provider detection are included. Minification is not encryption or a promise against suspension. SQL, configuration, licenses and system tools remain readable.

The portable runtime supports VLESS over WebSocket, TCP forwarding and UDP DNS. The supplied archives contained deployment recipes rather than Reality/AnyTLS/MTProto/WireGuard/OpenVPN engine source; those engines are not implemented here. Node SQLite is single-instance; no shared cross-install accounting is provided.

Local Node and Miniflare integration tests exercise private management, account creation, opaque subscriptions, subscription formats, authenticated WebSocket and quota reservation/refund. Provider API tests are mocked. Live Cloudflare/Railway/Render/SSH installations have not been verified by this package. CLI `verified` means private API and empty-root readiness only, not outbound connectivity or performance across ISPs.

Existing service names are refused. Failed provisioning can leave new resources; automatic rollback, upgrades and resume are not implemented. Preserve database backups before removing disks/volumes. Provider resources may incur charges.

Official references: [Workers upload](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/), [Pages upload](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/), [Railway API](https://docs.railway.com/integrations/api/api-cookbook), [Render Docker](https://render.com/docs/docker).
