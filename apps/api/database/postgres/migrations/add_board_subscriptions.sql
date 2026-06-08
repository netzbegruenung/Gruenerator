-- Board-level subscriptions (A9) as a first-class table, replacing the
-- '__board__' sentinel card_id previously stuffed into board_card_subscriptions.
-- Board-level activity events (A8) now use a NULL card_id instead of the sentinel.
-- No BEGIN/COMMIT — the migration runner wraps each file in a transaction.

CREATE TABLE IF NOT EXISTS board_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id    UUID NOT NULL REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    source      TEXT NOT NULL DEFAULT 'manual',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_board_subscriptions_board ON board_subscriptions (board_id);

ALTER TABLE board_card_activity ALTER COLUMN card_id DROP NOT NULL;

-- Migrate existing sentinel rows from the per-card tables.
INSERT INTO board_subscriptions (board_id, user_id, source, created_at)
SELECT board_id, user_id, source, created_at
FROM board_card_subscriptions
WHERE card_id = '__board__'
ON CONFLICT (board_id, user_id) DO NOTHING;

DELETE FROM board_card_subscriptions WHERE card_id = '__board__';

UPDATE board_card_activity SET card_id = NULL WHERE card_id = '__board__';
