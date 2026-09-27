-- Gruppen-Feed: eine geteilte Zeile ist ein Beitrag. Notiz beim Teilen,
-- Anheften durch Admins und ein flacher Kommentar-Thread je Beitrag.
-- Rein additiv; alte Clients schreiben weiter ohne Notiz.
ALTER TABLE group_content_shares ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE group_content_shares ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
ALTER TABLE group_content_shares ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_content_shares_pinned
  ON group_content_shares (group_id, pinned_at)
  WHERE pinned_at IS NOT NULL;

-- Entfernen des Beitrags (unshare/remove) löscht den Thread mit.
CREATE TABLE IF NOT EXISTS group_share_comments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    share_id    UUID NOT NULL REFERENCES group_content_shares(id) ON DELETE CASCADE,
    group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_group_share_comments_share
  ON group_share_comments (share_id, created_at);
