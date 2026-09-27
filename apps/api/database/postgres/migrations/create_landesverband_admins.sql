-- Who administers which Landesverband. Only a Hauptgrünerator-Super-Admin
-- (profiles.is_admin) writes rows here (see lvAdminAssignmentContract) — an
-- LV-admin can never grant themselves or anyone else admin rights.

CREATE TABLE IF NOT EXISTS landesverband_admins (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landesverband_id  TEXT NOT NULL REFERENCES landesverbaende(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT landesverband_admins_lv_user_unique UNIQUE (landesverband_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_landesverband_admins_user_id ON landesverband_admins(user_id);
