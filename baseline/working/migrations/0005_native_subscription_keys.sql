ALTER TABLE native_accounts ADD COLUMN subscription_key TEXT;
UPDATE native_accounts SET subscription_key=lower(hex(randomblob(32))) WHERE subscription_key IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_native_subscription_key ON native_accounts(subscription_key);
