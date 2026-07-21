-- Enforce the closed `document_subtype` set at the database as defence-in-depth
-- behind the contract-level `collabSubtypeSchema` (packages/contracts/src/schemas/docs.ts).
--
-- A CHECK constraint (not a native pgEnum) is deliberate: it enforces the set
-- WITHOUT changing the column type, so the many `document_subtype = ANY($n::text[])`
-- casts across the codebase keep working untouched. `NOT VALID` skips validation
-- of existing rows (any legacy value stays readable) while enforcing the set for
-- all new inserts/updates.
--
-- Keep the list in sync with COLLAB_SUBTYPE_VALUES in the contracts package.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'collaborative_documents_document_subtype_check'
  ) THEN
    ALTER TABLE collaborative_documents
      ADD CONSTRAINT collaborative_documents_document_subtype_check
      CHECK (
        document_subtype IN (
          'blank', 'docs', 'antrag', 'pressemitteilung', 'protokoll', 'notizen',
          'redaktionsplan', 'checkliste', 'einladung', 'tabelle', 'boards',
          'canvas', 'sheets', 'presentations'
        )
      ) NOT VALID;
  END IF;
END $$;
