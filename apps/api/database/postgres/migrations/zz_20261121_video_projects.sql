-- Video editor projects as server-side documents: ACL, sharing and Yjs reuse the
-- collaborative_documents pipeline (document_subtype = 'video'); only the
-- video-specific columns live in this 1:1 sidecar.
--
-- `source_ref`: where the project was seeded from, format `ki:<videoAiProjectId>:<version>`
--   (the AI cut is currently the only source).
--
-- The subtype CHECK is re-created with 'video' added. Keep the list in sync with
-- COLLAB_SUBTYPE_VALUES in the contracts package.
ALTER TABLE collaborative_documents DROP CONSTRAINT IF EXISTS collaborative_documents_document_subtype_check;

ALTER TABLE collaborative_documents
    ADD CONSTRAINT collaborative_documents_document_subtype_check
    CHECK (
        document_subtype IN (
            'blank', 'docs', 'antrag', 'pressemitteilung', 'protokoll', 'notizen',
            'redaktionsplan', 'checkliste', 'einladung', 'tabelle', 'boards',
            'canvas', 'sheets', 'presentations', 'video'
        )
    ) NOT VALID;

CREATE TABLE IF NOT EXISTS video_projects (
    document_id UUID PRIMARY KEY REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    slug_suffix VARCHAR(12) NOT NULL UNIQUE,
    aspect_ratio TEXT NOT NULL DEFAULT '9:16'
        CHECK (aspect_ratio IN ('16:9', '9:16', '1:1', '4:5')),
    source_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_projects_source_ref
    ON video_projects (source_ref);
