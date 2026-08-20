-- Deduplicate thread attachments by content.
--
-- Every turn whose request still carried the file bytes inserted ANOTHER row:
-- `saveThreadAttachment` was a plain INSERT with no uniqueness anywhere. The
-- damage was threefold — the table grew per turn, `formatThreadAttachmentsContext`
-- injected each row's full text separately (measured 20.08.2026: a 5794-char
-- file reached the model as 11588 chars), and every duplicate paid for its own
-- LLM summary that the prompt then never used.
--
-- `content_hash` is md5 over the trimmed extracted text, matching
-- `generateContentHash` in apps/api/utils/validation/hash.ts (the repo's single
-- source of truth for content hashing). For images and other binaries there is
-- no extracted text, so identity falls back to name + size.

ALTER TABLE chat_thread_attachments ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Backfill. Mirrors `attachmentContentHash()` exactly, including the trim that
-- `generateContentHash` applies to its input — otherwise a backfilled row and a
-- freshly written one would hash the same file differently and the dedupe would
-- silently stop working for existing threads.
UPDATE chat_thread_attachments
SET content_hash = CASE
  WHEN extracted_text IS NOT NULL AND btrim(extracted_text) <> ''
    THEN md5(btrim(extracted_text))
  ELSE md5(btrim(name || ':' || size_bytes::text))
END
WHERE content_hash IS NULL;

-- Collapse existing duplicates so the unique index below can be created.
--
-- Only rows that are duplicates BY CONTENT within the SAME thread are touched,
-- and the oldest survivor is kept (with its summary and its message_id). This
-- is not a lossy merge: the prompt builder already treated these rows as one
-- document, it just paid for each copy.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY thread_id, content_hash
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM chat_thread_attachments
  WHERE thread_id IS NOT NULL AND content_hash IS NOT NULL
)
DELETE FROM chat_thread_attachments a
USING ranked r
WHERE a.id = r.id AND r.rn > 1;

-- The guard itself. Partial, because `thread_id` is nullable and a NULL thread
-- has no "same thread" to be unique within.
CREATE UNIQUE INDEX IF NOT EXISTS idx_thread_attachments_content
  ON chat_thread_attachments (thread_id, content_hash)
  WHERE thread_id IS NOT NULL AND content_hash IS NOT NULL;
