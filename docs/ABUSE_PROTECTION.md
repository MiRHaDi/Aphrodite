# Destination abuse protections

The native transport requires an enabled, unexpired account and obtains a quota
lease before dialing. Existing per-account byte, connection and IP policies remain
unchanged. No database migration or account rewrite is required by these changes.

Additional protections:
- Reject non-global IPv6, IPv4-mapped/translation/transition IPv6, and reserved
  IPv4 ranges so these cannot be used to reach local services or metadata hosts.
- Resolve the destination through the configured DNS policy and pin that public
  address in upstream HTTP CONNECT and SOCKS handshakes. Client TLS/SNI data stays
  inside the tunnel unchanged. This prevents the upstream proxy from independently
  resolving a previously validated name to a private address. IPv6-only targets
  still require an IPv6-capable upstream proxy.
- Reject outbound TCP port 25 before DNS or dialing. Ordinary HTTP/HTTPS and DNS
  continue to work. SMTP submission on other ports is not changed.

These protections reduce specific abuse risks. They do not identify the cause of
the current Cloudflare restriction and do not guarantee approval or uninterrupted
service. No obfuscation or signature evasion is used.

Validation: TypeScript check, 87 tests, and bundled Node and Workers integration
checks pass (private UI syntax, account creation, subscription formats,
authenticated WebSocket, quota and refund). Live installation is pending provider
review; no upload to the blocked project was attempted for this change. A read-only
live check still reports one user with the pre-existing network API 502.
