-- Gruppen-Feed: eigene Beiträge (Text + Dateien), ohne etwas zu teilen.
-- Jeder Beitrag bekommt zusätzlich eine Zeile in group_content_shares
-- (content_type 'group_post', content_id = group_posts.id); Anheften und
-- Kommentare hängen an dieser Zeile. Die Dateien liegen auf der Platte
-- (uploads/group-posts), hier nur die Metadaten. Rein additiv.
CREATE TABLE IF NOT EXISTS group_posts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    author_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
    body        TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    edited_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_group_posts_group ON group_posts (group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS group_post_files (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id          UUID NOT NULL REFERENCES group_posts(id) ON DELETE CASCADE,
    group_id         UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    stored_filename  TEXT NOT NULL,
    file_name        TEXT NOT NULL,
    mime_type        TEXT NOT NULL,
    size_bytes       INTEGER NOT NULL,
    position         SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_group_post_files_post ON group_post_files (post_id, position);
