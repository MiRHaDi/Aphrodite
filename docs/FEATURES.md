# Aphrodite capabilities

Aphrodite is one cohesive edge gateway. Its runtime, administration APIs, database model, interface, deployment adapters, routing rules, and failover logic share the same typed codebase.

## Edge runtime

- Stable, case-insensitive public subscription addresses
- Bounded concurrent tunnel selection with timeout and target cooldown
- Ordered origin failover and edge response caching
- Adaptive rules for Iranian and international destinations
- Identical request handling in Worker and Pages deployments

## Administration

- Time and traffic policies for each user
- Batched policy changes for up to 200 users
- Five-minute activity windows that bound database writes
- Versioned, secret-free JSON backups
- Validated, merge-only backup restoration
- Compact audit events and protected same-origin APIs

## Security model

Credentials remain encrypted environment secrets. Backups contain only public route metadata and user policies. The database does not store administrator credentials, platform API tokens, subscription bodies, or complete traffic logs.
