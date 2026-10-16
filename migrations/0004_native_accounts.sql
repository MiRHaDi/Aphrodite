CREATE TABLE IF NOT EXISTS native_accounts (
  username TEXT PRIMARY KEY COLLATE NOCASE,
  uuid TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER,
  settings_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS native_configuration (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS native_usage (
  username TEXT PRIMARY KEY COLLATE NOCASE,
  used INTEGER NOT NULL DEFAULT 0,
  lifetime INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  volume_reset INTEGER NOT NULL,
  request_reset INTEGER NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS native_leases (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE,
  ip TEXT NOT NULL,
  expires INTEGER NOT NULL,
  remaining INTEGER NOT NULL DEFAULT 0,
  epoch INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_native_leases_user_expiry ON native_leases(username,expires);
CREATE INDEX IF NOT EXISTS idx_native_leases_expiry ON native_leases(expires);
