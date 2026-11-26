-- The project created automatically for a Landesverband
-- (services/groups/landesverbandProjects.ts). Unique across the trash on
-- purpose: a project its admins deleted is not recreated while its row exists.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS auto_landesverband TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_auto_landesverband ON groups (auto_landesverband);
