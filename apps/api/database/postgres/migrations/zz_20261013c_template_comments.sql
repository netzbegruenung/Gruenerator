-- Comments on Vorlagen (gallery detail dialog). `template_id` is the gallery
-- item id like for likes: a user_templates UUID or a Grünerator catalogue id,
-- so there is no FK; the service checks the Vorlage exists for the viewer.
CREATE TABLE IF NOT EXISTS template_comments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id TEXT NOT NULL,
    user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    body        TEXT NOT NULL,
    parent_id   UUID REFERENCES template_comments(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_template_comments_template ON template_comments(template_id, created_at);
CREATE INDEX IF NOT EXISTS idx_template_comments_parent ON template_comments(parent_id) WHERE parent_id IS NOT NULL;
