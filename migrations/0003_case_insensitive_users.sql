CREATE INDEX IF NOT EXISTS idx_subscription_routes_username_nocase
ON subscription_routes(username COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_user_policies_username_nocase
ON user_policies(username COLLATE NOCASE);
