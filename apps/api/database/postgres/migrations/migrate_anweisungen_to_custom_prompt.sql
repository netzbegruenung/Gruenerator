-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Merge per-generator Anweisungen into unified custom_prompt
-- ════════════════════════════════════════════════════════════════════════════
--
-- Context: The app previously had 6 separate prompt columns for different
-- generator types. These were replaced by a single `custom_prompt` column.
-- This migration merges any existing data from the old columns into
-- `custom_prompt` (if it is currently empty), then drops the old columns.
--
-- Safe to run multiple times: the DROP COLUMN uses IF EXISTS.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Step 1: Merge old per-type prompts into custom_prompt where it is empty
UPDATE profiles
SET custom_prompt = CONCAT_WS(
    E'\n\n',
    CASE WHEN NULLIF(TRIM(custom_antrag_prompt), '') IS NOT NULL
         THEN '## Anträge' || E'\n' || TRIM(custom_antrag_prompt) END,
    CASE WHEN NULLIF(TRIM(custom_social_prompt), '') IS NOT NULL
         THEN '## Social Media' || E'\n' || TRIM(custom_social_prompt) END,
    CASE WHEN NULLIF(TRIM(custom_rede_prompt), '') IS NOT NULL
         THEN '## Reden' || E'\n' || TRIM(custom_rede_prompt) END,
    CASE WHEN NULLIF(TRIM(custom_universal_prompt), '') IS NOT NULL
         THEN '## Universell' || E'\n' || TRIM(custom_universal_prompt) END,
    CASE WHEN NULLIF(TRIM(custom_gruenejugend_prompt), '') IS NOT NULL
         THEN '## Grüne Jugend' || E'\n' || TRIM(custom_gruenejugend_prompt) END,
    CASE WHEN NULLIF(TRIM(custom_buergeranfragen_prompt), '') IS NOT NULL
         THEN '## Bürgeranfragen' || E'\n' || TRIM(custom_buergeranfragen_prompt) END
)
WHERE NULLIF(TRIM(COALESCE(custom_prompt, '')), '') IS NULL
  AND (
    NULLIF(TRIM(COALESCE(custom_antrag_prompt, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(custom_social_prompt, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(custom_rede_prompt, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(custom_universal_prompt, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(custom_gruenejugend_prompt, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(custom_buergeranfragen_prompt, '')), '') IS NOT NULL
  );

-- Step 2: Drop the old per-type prompt columns
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_antrag_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_social_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_universal_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_gruenejugend_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_rede_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_buergeranfragen_prompt;

COMMIT;

-- Step 3: Verification query (run after migration)
-- Shows profiles whose custom_prompt was populated by the migration
SELECT id, display_name, LEFT(custom_prompt, 80) AS custom_prompt_preview
FROM profiles
WHERE custom_prompt IS NOT NULL AND custom_prompt != ''
ORDER BY updated_at DESC
LIMIT 20;
