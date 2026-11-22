-- Explicit Landesverband of a project: its LV recipe variants win over the
-- person's active role in chats inside the project. NULL = none.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS landesverband TEXT;
