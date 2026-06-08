-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Board card features — activity log, watchers, due-date mirror, attachments
-- Adds relational tables backing the per-card activity timeline, card watchers /
-- subscriptions (+ notifications), a due-date mirror for the reminder worker, and
-- file attachments. All keyed on (board_id, card_id); card_id has no FK because
-- cards live in the Yjs document, not Postgres.
-- ════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- Table: board_card_activity (append-only timeline)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_card_activity (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id    UUID NOT NULL REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    card_id     TEXT NOT NULL,
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_board_card_activity_board_card
    ON board_card_activity (board_id, card_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- Table: board_card_subscriptions (watchers)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_card_subscriptions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id    UUID NOT NULL REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    card_id     TEXT NOT NULL,
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    source      TEXT NOT NULL DEFAULT 'manual',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (board_id, card_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_board_card_subscriptions_board_card
    ON board_card_subscriptions (board_id, card_id);

-- ──────────────────────────────────────────────────────────────────────────
-- Table: board_card_due_dates (relational mirror for the reminder worker)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_card_due_dates (
    board_id    UUID NOT NULL REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    card_id     TEXT NOT NULL,
    due_date    TEXT NOT NULL,
    reminded_at TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (board_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_board_card_due_dates_due
    ON board_card_due_dates (due_date);

-- ──────────────────────────────────────────────────────────────────────────
-- Table: board_attachments (file uploads on a card)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_attachments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id        UUID NOT NULL REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    card_id         TEXT NOT NULL,
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    file_name       TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    mime_type       TEXT,
    file_size       BIGINT,
    is_cover        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_board_attachments_board_card
    ON board_attachments (board_id, card_id, created_at);
