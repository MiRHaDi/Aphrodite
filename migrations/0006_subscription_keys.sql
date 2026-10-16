CREATE TABLE IF NOT EXISTS subscription_keys (
  username TEXT PRIMARY KEY COLLATE NOCASE,
  token TEXT NOT NULL UNIQUE,
  legacy_allowed INTEGER NOT NULL DEFAULT 0 CHECK(legacy_allowed IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- Freeze compatibility for existing accounts only. New accounts default to token-only.
INSERT OR IGNORE INTO subscription_keys(username,token,legacy_allowed)
SELECT username,lower(hex(randomblob(32))),1 FROM subscription_routes;
