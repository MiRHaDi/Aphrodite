# Public subscription addresses

`PUBLIC_EDGE_HOST` defaults to `smart.dr-mirhadi.ir`. Existing feed URLs remain valid. All supported URI lists (raw/Base64, VLESS, Trojan, VMess, Shadowsocks), JSON and YAML configurations receive cleaned display names. Known edge aliases are rewritten to the public endpoint; independent Railway backups retain their addresses, credentials and transport paths. The compatibility renderer still supplies optional IP variants.

Optional `EDGE_ENDPOINTS_JSON` contains an allowlist of `{address,sni,host}` tuples. Each must point to this service, have a valid certificate for its SNI, and accept the indicated Host header. `address` may be a domain, IPv4 or IPv6. Do not insert unrelated domains, arbitrary SNI values or untested IPs. `EDGE_HOST_ALIASES` lists only domains belonging to the same edge service.

Rotation is deterministic per user and time window (`EDGE_ROTATION_MINUTES`, default 60). Subscription cache keys include the window. Rotation takes effect when clients refresh their subscription; it cannot migrate an established connection or repair an unreachable subscription URL. Clients must still refresh according to their update interval. Existing Railway entries provide independent backup connections.

Production initially uses only the smart hostname. Additional tuples should be enabled only after successful TLS and authenticated transport tests. This feature does not make a blocked hostname reachable automatically.

Deployment note (2026-10-16): the Cloudflare upload and PUBLIC_EDGE_HOST binding were confirmed. Public health probes returned HTTP 522, so public subscription delivery and transport health remain unverified.

## Unified output

All configured control-plane origins are fetched concurrently (maximum four, eight-second timeout); supported URI feeds are merged and exact connection identities deduplicated. Clash documents merge proxy lists and selection groups. Credentials and functional routing actions remain unchanged. Display names show only Smart/country and an ordinal, including the adaptive-routing profile.

`SUBSCRIPTION_GATEWAYS_JSON` allows audited same-account gateway variants: `[{"host":"route.example.com","paths":["/edge/smart"]}]`. Paths must be supported by that gateway and authenticate the same per-user account. Shared-UUID services must not be inserted as personal accounts: that would bypass per-user accounting. Empty Pages projects cannot contribute connections.

On 2026-10-16, route1, route5 and route7 answered health checks; four other gateway domains and smart returned 522. Public transport tests remain separate from HTTP health. The Pages API currently returns 403 with the available token; the prior verified inventory showed empty p1/p2/p4 deployments, so no Pages connections were invented.

Final live verification (2026-10-16): smart and the existing legacy feed domains were mapped to the existing healthy gateway after a compatibility upgrade preserving its panel and transport paths. Smart and the legacy feed health checks returned 200. A representative existing user received 51 configurations across eight hostnames with Mozilla, v2rayNG and Happ user agents. All display labels passed the infrastructure-word exclusion check. An authenticated VLESS WebSocket request through smart received an HTTP response. The three additional gateway routes also passed authenticated transport tests. These are sample transport checks, not a claim that every country/ISP was benchmarked. All 115 backend users were audited for configured protocol/inbound availability; no user credentials or quotas were modified.

Client formats now have distinct upstream paths and cache keys, preventing a cached Base64 feed from being delivered to Clash. Live Clash.Meta and explicit format=clash probes returned valid configurations with 50 proxies and consistent selection-group references.
