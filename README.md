<p align="center"><img src="docs/assets/github-banner.svg" alt="Aphrodite — your network, beautifully managed" width="100%"></p>

<p align="center"><b>Private administration · Adaptive subscriptions · Guided deployment</b><br>
<a href="README.fa.md">فارسی</a> · <a href="https://github.com/MiRHaDi/Aphrodite/releases">Download</a> · <a href="docs/INSTALLER.md">Documentation</a> · <a href="SECURITY.md">Security</a></p>

## Install in one line

Copy **one** command into your existing terminal. The wizard prepares official Node 24 and locked dependencies, then asks for a destination and your token. No Git or Node installation is needed beforehand.

**Bash · Linux / macOS** — curl is required:

```bash
bash -c 'f=$(mktemp); curl -fsSL https://raw.githubusercontent.com/MiRHaDi/Aphrodite/main/install.sh -o "$f" && bash "$f"; r=$?; rm -f "$f"; exit "$r"'
```

**PowerShell · Windows:**

```powershell
& ([scriptblock]::Create((Invoke-RestMethod 'https://raw.githubusercontent.com/MiRHaDi/Aphrodite/main/install.ps1')))
```

**CMD · Windows:**

```bat
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex (Invoke-RestMethod 'https://raw.githubusercontent.com/MiRHaDi/Aphrodite/main/install.ps1')"
```

These commands download and execute this repository's installer over HTTPS. You can [review Bash](install.sh) or [PowerShell](install.ps1) first.

### A clear setup

**Language → destination → hidden token → build → readiness checks → private management details**

Choose English or Persian and a menu number. The application interface also supports Chinese, Russian and Arabic. Tokens are not embedded in generated source or written to env files.

| Destination | Before you start |
|---|---|
| Workers | Workers Scripts Edit + D1 Edit; account ID if auto-discovery is unavailable |
| Pages | Cloudflare Pages Edit + D1 Edit |
| Railway | Account token, or project token with project/environment IDs |
| Render | API token, repository access, paid persistent-disk plan |
| Docker | A running daemon; Docker Desktop is not installed automatically |
| VPS | SSH, verified host fingerprint; root/passwordless sudo for Debian/Ubuntu prerequisites |
| Build only | No cloud resources or token required |

Existing service names are refused. Failed provisioning can leave resources, and provider charges may apply. [Full requirements and unattended options](docs/INSTALLER.md).

## Manage your connections

| Accounts | Profiles | Runtime |
|---|---|---|
| Volume limits and expiry | One URL, negotiated output | Workers and Pages |
| Native quota reservations | Automatic/manual selection groups | Persistent Node/SQLite |
| Opaque subscription links | Configured country exits and backups | Docker and SSH |
| Private administrator path | Happ, Hiddify, Xray, Clash-family formats | Independent accounting per installation |

User-Agent detection is not universal; explicit formats are available. Country exits must actually exist. Surge is limited to compatible configured upstream protocols; VLESS-only native accounts do not provide Surge profiles. [Compatibility details](docs/CLIENT_PROFILES.md).

## Validation status

**2.0.0-beta.2 is locally tested, not a verified final cloud release.** TypeScript, 77 tests and bundled Node/Miniflare integration passed. [Live Cloudflare findings](docs/CLOUDFLARE_VALIDATION.md) are recorded separately. Readiness verifies the private API and empty root, not every ISP. Use `npm run test:live` with credentials in the active process environment to test outbound transport.

## Documentation and development

[Installer](docs/INSTALLER.md) · [فارسی](docs/INSTALLER.fa.md) · [Client profiles](docs/CLIENT_PROFILES.md) · [Private paths](docs/PRIVATE_ENTRYPOINTS.md) · [Architecture](docs/ARCHITECTURE.md) · [Contributing](CONTRIBUTING.md)

```bash
npm ci --ignore-scripts
npm run check
npm test
node test/integration/portable_artifact.mjs node
node test/integration/portable_artifact.mjs workers
```

Node.js 24 required. Standard bundling/minification is used, with no provider-detection evasion.

[MIT license](LICENSE) · [Required dependency notices](THIRD_PARTY_NOTICES.md)
