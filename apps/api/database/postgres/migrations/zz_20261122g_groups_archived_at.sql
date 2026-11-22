-- Projects can be archived by their admins: hidden from the main list, read-only.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
