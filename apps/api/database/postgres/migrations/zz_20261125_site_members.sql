-- Sites: several admins/editors per site (site_members) and project-owned sites (group_id).
-- user_sites.user_id now means "created by"; every existing site gets its creator as admin.
ALTER TABLE user_sites ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS site_members (
    site_id    UUID NOT NULL REFERENCES user_sites(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    added_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (site_id, user_id)
);

CREATE INDEX IF NOT EXISTS site_members_user ON site_members (user_id);
CREATE INDEX IF NOT EXISTS user_sites_group ON user_sites (group_id) WHERE group_id IS NOT NULL;

INSERT INTO site_members (site_id, user_id, role)
SELECT id, user_id, 'admin' FROM user_sites WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;
