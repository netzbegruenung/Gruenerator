-- Reports on user content (project posts/comments, chat answers, studio
-- assets). One row per reporter and target; the admin queue groups them by
-- target. Three distinct open reporters hide a studio asset until review.
CREATE TABLE IF NOT EXISTS content_reports (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind         TEXT NOT NULL,
    target_id    TEXT NOT NULL,
    reporter_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reason       TEXT NOT NULL,
    note         TEXT NULL,
    excerpt      TEXT NULL,
    group_id     UUID NULL,
    thread_id    TEXT NULL,
    status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    resolution   TEXT NULL CHECK (resolution IN ('removed', 'restored', 'dismissed')),
    resolved_by  UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
    resolved_at  TIMESTAMPTZ NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_content_reports_reporter_target UNIQUE (reporter_id, kind, target_id)
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status_created
    ON content_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_reports_target
    ON content_reports (kind, target_id);
