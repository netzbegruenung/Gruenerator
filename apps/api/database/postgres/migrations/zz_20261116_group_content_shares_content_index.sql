-- Look up the shares of ONE piece of content ("is this thread shared anywhere?",
-- the thread list's per-row EXISTS). uq_group_content_shares_target leads with
-- group_id, so a lookup by (content_type, content_id) alone cannot use it and
-- would scan the table once per thread row.
CREATE INDEX IF NOT EXISTS idx_group_content_shares_content
    ON group_content_shares (content_type, content_id);
