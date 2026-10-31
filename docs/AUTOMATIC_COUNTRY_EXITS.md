# Automatic country exits (Node standalone)

Status: opt-in implementation; not installed on the existing Cloudflare Pages service.

Set `AUTO_COUNTRY_EXITS=true` on a standalone Node deployment to enable the in-process refresher. No desktop task or browser is required. Management/database roles are refused. Pages and Workers do not run this Node scheduler.

The published ProxyCheck public API supplies its available-country catalog first. Each refresh rotates through up to 32 available countries (override with `COUNTRY_EXIT_BATCH=1..32`) and checks at most two HTTP CONNECT candidates per country. This prevents countries outside a global top list from being starved. Countries with no available compatible relay cannot be invented. These are public third-party relays, not trusted or owned servers. Operators can observe destination/connection metadata; probe success does not establish trust. Enabling this mode routes selected country traffic through those relays. It is disabled by default. Never send plaintext sensitive traffic through a public relay.

Candidates must use public IPv4 literals, have no credentials, and pass all of: end-to-end certificate-validated HTTPS geolocation matching the proposed country, Google HTTPS 204, and Cloudflare HTTPS 200. Source country labels alone never publish a route. User credentials and subscriptions are not used by discovery/probes.

Refresh starts at server startup and checks its due time each minute. Refresh cycles are limited to once per 30 minutes, two probes concurrently, eight seconds per candidate, and 256 KiB responses. At most two exits per country and 512 total records are retained. Active records expire six hours after verification. A failed candidate is removed; a source outage retains only unexpired verified records. Empty/expired country pools fail closed, with no direct fallback to a different country. The Smart direct route remains unchanged. Pool state is memory-only; a server restart requires new verification. No account, quota, key or expiry records are modified.

Successful probes from a developer workstation do not prove reachability from a production host. Before activation, validate from the intended server with synthetic accounts and an independent database. Subscription country names and flags are generated from the currently verified pool, including countries outside the original fixed list. Existing subscription URLs and UUIDs remain unchanged; clients receive the updated countries when refreshing their subscriptions. Standalone mode with remote connection-endpoint overrides is refused because those nodes would not share the verified local pool.

Source API documentation: https://proxycheck.app/docs/api (public-proxies endpoint).
