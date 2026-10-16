CREATE TABLE IF NOT EXISTS user_policies (
  username TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  data_limit_bytes INTEGER NOT NULL DEFAULT 0 CHECK(data_limit_bytes >= 0),
  expires_at INTEGER,
  access_windows INTEGER NOT NULL DEFAULT 0 CHECK(access_windows >= 0),
  last_access_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(username) REFERENCES subscription_routes(username) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_policies_expires_at ON user_policies(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_policies_last_access_at ON user_policies(last_access_at DESC);

INSERT OR IGNORE INTO user_policies(username, enabled, data_limit_bytes, expires_at)
SELECT username, enabled, 0, NULL FROM subscription_routes;
