# Aphrodite

Private management is now the deployment default. Configure ADMIN_PATH once with `node scripts/setup-private.mjs` (or `--path`), then use that private path. Public root/panel/API/health probes return empty responses; new accounts receive opaque subscription links. See [private entry points](docs/PRIVATE_ENTRYPOINTS.md).

**A resilient, bilingual edge gateway and administration layer.**

[![CI](https://github.com/MiRHaDi/Aphrodite/actions/workflows/ci.yml/badge.svg)](https://github.com/MiRHaDi/Aphrodite/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-7c3aed.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020)](https://developers.cloudflare.com/workers/)

[راهنمای فارسی](README.fa.md) · [Deployment](docs/DEPLOYMENT.md) · [Pages](docs/PAGES.md) · [Architecture](docs/ARCHITECTURE.md) · [Features](docs/FEATURES.md) · [Security](SECURITY.md)

Aphrodite turns a Cloudflare Worker into a small, auditable edge layer in front of an authorized control plane. It keeps public subscription URLs stable, adds adaptive client routing, fails over between authorized origins, exposes configured WebSocket transports, and provides a polished Persian/English-ready administration panel.

## Highlights

- **User management:** create limited or unlimited users, view user/node health, and write audit events.
- **Stable subscriptions:** public `/feed/:username` URLs stay independent of the backend hostname.
- **Adaptive routing:** Iranian domains use the direct route when the client is inside Iran and an Iran exit when the client is abroad; other traffic uses the proxy route.
- **No GeoIP/GeoSite downloads:** generated adaptive rules use explicit domain lists and outbound tags, avoiding startup failures caused by missing asset sections.
- **Multiple transports:** compatible with VLESS, VMess, Trojan, and Shadowsocks inbounds, including WS, gRPC, HTTPUpgrade, and XHTTP where the configured backend supports them.
- **Resilience:** edge cache, sequential origin failover, multiple tunnel targets, and an optional stateless relay.
- **Safer defaults:** bearer-protected admin API, constant-time token comparison, strict headers, parameterized D1 queries, validation, and no credentials in source.
- **Low database load:** one indexed route lookup per cache miss; subscription bodies live in Cache API rather than D1.
- **Bounded edge accounting:** policy reads are cached and activity is aggregated into five-minute windows; traffic bytes remain accurately enforced by the authorized control plane.
- **Worker and Pages:** the same typed runtime can run as a Worker or through Cloudflare Pages Functions.
- **Fast tunnel selection:** bounded concurrent connection attempts, strict timeouts, and temporary cooldown for unhealthy targets reduce failover delay without unbounded subrequests.
- **Portable administration:** secret-free JSON backups, validated merge restore, case-insensitive feed links, and bounded D1 batch operations.

## Architecture

```text
Aphrodite client
       │
       ▼
Cloudflare Worker ── D1 route registry + audit log
  │          │
  │          └── WebSocket tunnel pool
  ▼
Authorized control plane ◄── optional stateless backup relay
```

Cloudflare Workers handle HTTP and WebSocket traffic; arbitrary TCP/UDP protocols need a compatible server or provider transport. Aphrodite therefore manages and distributes such profiles but does not pretend that a Worker can terminate WireGuard or OpenVPN.

## Quick start

```bash
git clone https://github.com/MiRHaDi/Aphrodite.git
cd Aphrodite
npm ci
cp wrangler.toml.example wrangler.toml
npx wrangler d1 create aphrodite-db
# Copy the returned database_id into wrangler.toml
npm run db:migrate:remote
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put CONTROL_PLANE_TOKEN
npm run deploy
```

If the control plane does not provide a long-lived API token, set `CONTROL_PLANE_USERNAME` and `CONTROL_PLANE_PASSWORD` as Worker secrets instead. Configure only origins and tunnel targets you control.

The panel is available at `/panel`; subscriptions are served from `/feed/<username>`; health is at `/healthz`.

## Responsible operation

Aphrodite is designed for authorized network administration and reliable access to your own services. Follow provider terms and local law, publish an abuse contact, monitor resource usage, and keep a removable origin outside the edge layer. The project intentionally contains no source camouflage, provider-detection bypass, credential harvesting, or public-proxy scraping.

## Development

```bash
npm ci
npm run check
npm test
npm run dev
```

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
