-- Agent-created documents linked to a board card ("Grünerator-Dokumente").
--
-- The board agent (@Grünerator) creates a document from a card comment and needs
-- to surface it on the card. The previous approach wrote into the board's Yjs
-- `field-linked-docs` cell via the Hocuspocus internal API — fragile (depends on
-- the internal token, the board doc loading, and matching the card row) and it
-- silently failed. This relational table is the reliable equivalent of
-- board_attachments: the worker INSERTs directly and the card lists rows via a
-- ts-rest contract. The manual "Dokumente"/Verknüpfen list (Yjs) is unaffected.
--
-- No BEGIN/COMMIT — the migration runner wraps each file in a transaction.

CREATE TABLE IF NOT EXISTS board_card_documents (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id      UUID NOT NULL REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    card_id       TEXT NOT NULL,
    document_id   UUID NOT NULL REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    created_by    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- One link per (card, document): makes the agent's insert idempotent.
    UNIQUE (card_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_board_card_documents_board_card
    ON board_card_documents (board_id, card_id, created_at);
