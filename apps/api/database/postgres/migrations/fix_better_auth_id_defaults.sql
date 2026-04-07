-- Fix Better Auth ID defaults
-- The ba_* tables were created without DEFAULT on their id columns,
-- but generateId: false delegates ID generation to the database.

ALTER TABLE ba_accounts ALTER COLUMN id SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE ba_sessions ALTER COLUMN id SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE ba_verification ALTER COLUMN id SET DEFAULT gen_random_uuid()::TEXT;
