# Public subscription addresses

`PUBLIC_EDGE_HOST` defaults to `smart.dr-mirhadi.ir`. Existing feed URLs remain valid. All supported URI lists (raw/Base64, VLESS, Trojan, VMess, Shadowsocks), JSON and YAML configurations receive cleaned display names. Known edge aliases are rewritten to the public endpoint; independent Railway backups retain their addresses, credentials and transport paths. The compatibility renderer still supplies optional IP variants.

Optional `EDGE_ENDPOINTS_JSON` contains an allowlist of `{address,sni,host}` tuples. Each must point to this service, have a valid certificate for its SNI, and accept the indicated Host header. `address` may be a domain, IPv4 or IPv6. Do not insert unrelated domains, arbitrary SNI values or untested IPs. `EDGE_HOST_ALIASES` lists only domains belonging to the same edge service.

Rotation is deterministic per user and time window (`EDGE_ROTATION_MINUTES`, default 60). Subscription cache keys include the window. Rotation takes effect when clients refresh their subscription; it cannot migrate an established connection or repair an unreachable subscription URL. Clients must still refresh according to their update interval. Existing Railway entries provide independent backup connections.

Production initially uses only the smart hostname. Additional tuples should be enabled only after successful TLS and authenticated transport tests. This feature does not make a blocked hostname reachable automatically.

Deployment note (2026-10-16): the Cloudflare upload and PUBLIC_EDGE_HOST binding were confirmed. Public health probes returned HTTP 522, so public subscription delivery and transport health remain unverified.
