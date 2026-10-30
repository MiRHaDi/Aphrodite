# Shared data authority and multiple management servers

The current build supports three roles on separate services:

* `database`: a private HTTPS RPC endpoint over one authoritative D1/SQLite database.
* `management`: panel, accounts, subscriptions and connection accounting. Multiple management services can use the same remote database, each with its own data credential and administrator credential.
* `connection`: database-free transport nodes. Each node may have its own accounting credential. All managers accept the configured accounting token ring and enforce the same authoritative database ledger.

Workers and Pages can host all three roles. The portable Node runtime supports database and management roles on a server behind HTTPS. Existing provider account profiles still allow independent Cloudflare API tokens. Provider API credentials, data-plane credentials, connection credentials and administrator credentials are separate.

This is shared-authority operation, not independent database replication or automatic multi-master failover. Losing the data authority stops authoritative operations; no independent empty database or quota is substituted. Writes are never automatically retried after network failure, because their result can be ambiguous. The existing atomic ledger batches remain one database transaction. Identity and connection registry caches retain their existing short refresh intervals; this does not promise instantaneous cache invalidation across managers.

## Installer and API configuration

Use the existing JSON CLI or local installer API with `APHRODITE_VARIABLES` in the credential-bearing process environment / stdin envelope. Do not place real tokens in config files or command arguments. Use a separate saved installation name/state for each service. `--topology standalone` installs a single role, not necessarily a combined application.

1. Install a **new test data authority**, using Workers/Pages or the portable Node runtime:

   `DEPLOYMENT_ROLE=database`, `DATA_CONTROL_PATH=<random private path, 16+ characters>`, `DATA_CONTROL_TOKEN=<primary random data token, 32+ characters>`, `DATA_CONTROL_TOKENS_JSON=["<manager-one token>","<manager-two token>"]`.

   The ordinary installer provisions/migrates its database and verifies an authenticated database query plus the blank public root. Keep this database separate from production. Data tokens grant full database access and belong only on trusted management servers; never give them to a browser or connection node.

2. Install each manager with a new installation identity and:

   `DEPLOYMENT_ROLE=management`, `DATA_CONTROL_URL=https://data.example/<private-path>`, `DATA_CONTROL_TOKEN=<that manager's accepted data token>`, `EDGE_CONTROL_PATH=<private accounting path>`, `EDGE_CONTROL_TOKENS_JSON=["<connection-one token>","<connection-two token>"]`.

   Use the same data URL for all managers. Configure `CONNECTION_ENDPOINTS_JSON` with the initial shared endpoints, or register endpoints through the authenticated deployment API. The registry is stored in the shared database. Configure the same subscription naming policy and canonical domain settings where identical public URLs are wanted. Old user keys and protocol UUIDs are read from the authority, not regenerated for each manager.

   Alternatively, `--topology split` plus the remote-data variables installs a manager and its connection nodes using the existing account profiles. The manager does not create a local D1. The installer refuses to detach an existing local DB; use a new management service for this topology.

3. Each connection service uses `EDGE_CONTROL_URL=https://manager.example/<accounting-path>` and its own `EDGE_CONTROL_TOKEN`. Add that token to every manager it is authorized to use. Do not put database credentials on connection nodes. Connection nodes currently use one manager URL each; there is no automatic RPC failover or retry.

The API/CLI can install these services sequentially using independent provider tokens. There is no new interactive cluster wizard, automatic fleet discovery, database merge or cross-provider migration. This capability does not move an existing production installation automatically.

## Verification

`npm run test:cluster` runs actual bundled workerd services: one synthetic D1 authority, two management workers with distinct data tokens and two connection workers with distinct accounting tokens. It checks account identity, aggregated subscriptions, quota visibility across managers, denial at the shared limit, cross-manager refund, credential separation and rollback of a failed multi-statement transaction. `npm run test:split` separately verifies transport authentication and shared quota through WebSockets.

These local tests do not establish live provider availability, public DNS/TLS readiness, geographic exits or Internet transport success. Before production migration, test the intended live provider combination with synthetic users, then back up code, bindings, DNS and user data and prepare rollback. Do not join separate existing databases by replacing their bindings.
