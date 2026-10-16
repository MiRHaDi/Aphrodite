# Native core · 2.0 beta

This independently implemented core provides D1-backed account management, byte reservations, request/concurrency/IP ceilings, expiry and scheduled quota resets; VLESS WebSocket framing and early data; bounded queues; SOCKS4/5 and HTTP(S) proxy negotiation; DNS-over-HTTPS and bounded TTL caches; address/port pools; four subscription formats; local QR generation; previewed legacy/native imports; and optional Cloudflare analytics. It uses the existing five-language workspace.

The default entry (`src/index.ts`) can use configured Relay routes with the encrypted `NATIVE_RELAY_UUID` secret. Direct sockets are isolated in `src/direct-worker.ts`. HTTPS upstream proxies require that direct entry; the Relay entry does not silently downgrade proxy TLS. Optional Durable Object accounting has a separate state-worker template; atomic D1 is the default and works across edge instances sharing the database.

New native feeds require a random subscription token independent from their VLESS UUID. Existing legacy feeds are unchanged. Identity rotation keeps the feed token. Import previews preserve existing accounts and issue new connection credentials to imported accounts. Administrators must retain backups securely because they contain connection credentials.

D1 reserves at most 2 MiB per live session, charges the reservation conservatively, and refunds unspent bytes on normal closure. A crashed execution may leave the final unused block charged. Lease lifetime is 90 seconds with a 30-second heartbeat. Expired leases stop counting toward concurrency/IP ceilings; their unconfirmed bytes are not silently forgiven. Traffic is not written to D1 per packet.

Native settings and account APIs are under `/api/native/`; they require the normal administrator token. Settings include data/request limits, simultaneous connection/IP limits, reset intervals, address rotation, TLS ports/fingerprint, proxy pools, DNS filters and client fragmentation hints. `/api/cloudflare/usage` requires separately configured analytics credentials and reports unavailable analytics honestly.

Local validation includes the real Workers runtime: VLESS WS authentication, D1 reservation/refund, concurrent connection denial, counters/reset, protected feed tokens, raw/Base64/Clash/Xray outputs and local QR. Unit coverage includes protocol parsing, fragmented proxy responses, private-address checks and account policies. External TCP, all proxy types, ISP performance and client fragmentation still need real-network validation.

Cloudflare preview deployments returned runtime error 1101 in this run, including minimal capability probes. The cause is unresolved. Production remains on stable 1.5.1; this beta must not be described as fully activated. The Persian [capability matrix](native-core.fa.md) records implementation and validation boundaries.

Automatic execution of remote repository code, weak password hashing and a recovery endpoint accepting unrelated provider tokens were not reproduced. Existing token authentication and reviewed release/deployment workflows replace those mechanisms.

## Reproduce local validation

Run `npm ci`, `npm run check`, `npm test`, and `npm run pages:build`. For the local runtime integration test, use a disposable local D1 database with migrations 0001 through 0006 applied, set `NATIVE_ENABLED="true"`, then run `npx wrangler dev --local --port 8788 --ip 127.0.0.1 --var ADMIN_TOKEN:local-test --var ADMIN_PATH:local-private-management` in a background process. Install Python `websocket-client` and run `python test/integration/native_runtime.py`. The test creates a local account and disables it at the end; it must never target production. It checks accounting/protocol behavior without requiring an external tunnel.
