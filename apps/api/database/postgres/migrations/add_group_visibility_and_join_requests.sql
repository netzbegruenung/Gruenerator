-- Public groups: discoverability + admin-moderated join requests.
-- Runner wraps this in a transaction (no BEGIN/COMMIT here).

-- 1. Group discoverability ----------------------------------------------------
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'all'
    CHECK (audience IN ('de-DE', 'de-AT', 'all'));

-- 2. Join request lifecycle ---------------------------------------------------
CREATE TABLE IF NOT EXISTS group_join_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'denied')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ
);

-- At most one PENDING request per (group, user); approved/denied rows are history.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_group_join_requests_pending
    ON group_join_requests (group_id, user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_group_join_requests_group_status
    ON group_join_requests (group_id, status);
CREATE INDEX IF NOT EXISTS idx_groups_is_public
    ON groups (is_public) WHERE is_public = TRUE;
