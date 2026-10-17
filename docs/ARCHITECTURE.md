# Split deployment architecture

Cloudflare guided installs default to `--topology split`: one management service
and two connection services (one Worker and one Pages project). Change the count
with `--connections 1..8` and provider sequence with
`--connection-providers workers,pages`. Other providers retain standalone mode;
split Node/Railway/Render orchestration is not implemented by this installer.

## Responsibilities

| Management Worker or Pages | Connection Workers or Pages |
|---|---|
| Private panel, account creation and policies | Authenticated VLESS WebSocket transport |
| Subscription links and client formats | Outbound TCP and DNS transport |
| D1 users, subscription keys and usage ledger | No D1 binding and no local user database |
| Atomic reservations shared by all nodes | Requests identity and reservations from center |
| Administrator token | Separate restricted machine token |
| Rejects every WebSocket upgrade | No panel, user management or subscription API |

The management build has no `cloudflare:sockets` import and no VLESS handshake
handler. Connection builds have no administrator credentials. Machine requests
use HTTPS, a separate random endpoint and token, bounded request bodies and no
redirect following. Only identity, open, reserve, heartbeat and close are allowed;
reset, import and administrative operations are unavailable to this token.
The center reloads authoritative account policy and does not trust a node-supplied
account record. Subscription keys are not returned with connection identities.

Payload traffic flows between the client, a connection service and destination;
it does not traverse the management service. The center reserves byte blocks,
checks policy on heartbeats and refunds unused reservations on close. All nodes
use the same ledger, so switching nodes does not reset the user quota. If the
center is unavailable new authorization/reservations fail closed; already reserved
bytes can be used until the next failed heartbeat/reservation. This is not an
accounting availability or cost guarantee. D1 reservation writes still occur;
this change does not implement arbitrary bulk accounting or reduce provider limits.

Existing configured relay routes can remain on connection services. A country
requires a working exit in that country; creating another Worker/Pages does not
create a new geographical exit automatically.

## Existing data and migration

No schema migration is needed for this split. `--database-id UUID` reuses a
compatible existing D1 database only on the management service, checks its native
account columns, and does not replay migrations or overwrite user rows. A fresh
installation creates and migrates one D1 database. Connection services never
create or bind D1. Multiple complete installations still have independent ledgers.

Before a live cutover, preserve an encrypted backup, administrator credentials,
user UUIDs, subscription keys, quota/usage and expiry. Retain the existing
subscription hostname and its key lookup tables; change only the connection
endpoint pool in emitted profiles. Existing service names are refused by the
installer rather than overwritten, and existing DNS is not replaced. Therefore
migrating the current live hostname requires an explicit reviewed update/cutover;
`--database-id` alone does not move DNS or update an existing service.

The current Cloudflare deployment block must be reviewed by the provider. No live
migration, deletion or replacement to circumvent that restriction was performed.
This separation is an application architecture choice, not a guarantee against
suspension; the full workload remains subject to provider terms.

## Verification

`npm run check` and `npm test` cover source and installer behavior. Run
`node test/integration/split_artifacts.mjs` for real bundled management and two
connection runtimes with one central D1, shared quota/refund, role isolation,
subscriptions and unchanged identity/expiry/keys. Existing standalone Node and
Workers bundle tests remain available. These are local tests; real provider
connectivity and cross-ISP performance require a separate live acceptance test.
`scripts/test-live.mjs` selects the first configured connection node, or accepts
`TEST_CONNECTION_URL`, while account/panel checks remain against management.
