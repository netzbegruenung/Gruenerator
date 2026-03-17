-- ============================================================================
-- Combined migration script — run all pending migrations in order
-- Date: 2026-03-17
-- Target: test server (gruenerator-test.netzbegruenung.verdigado.net)
-- ============================================================================

-- 1. Migrate auto_save_on_export → beta_features (2025-11-15)
UPDATE profiles
SET beta_features = jsonb_set(
  COALESCE(beta_features, '{}'::jsonb),
  '{autoSaveOnExport}',
  'true'::jsonb,
  true
)
WHERE auto_save_on_export = true;

-- 2. Merge per-generator Anweisungen → unified custom_prompt (2026-02-07)
BEGIN;

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

ALTER TABLE profiles DROP COLUMN IF EXISTS custom_antrag_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_social_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_universal_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_gruenejugend_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_rede_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_buergeranfragen_prompt;

COMMIT;

-- 3. Drop deprecated auto_save_on_export (2026-02-19)
ALTER TABLE profiles DROP COLUMN IF EXISTS auto_save_on_export;

UPDATE profiles
SET beta_features = beta_features - 'autoSaveOnExport'
WHERE beta_features ? 'autoSaveOnExport';

-- 4. Add 'draft' to shared_media status constraint (2026-03-07)
ALTER TABLE shared_media DROP CONSTRAINT IF EXISTS shared_media_status_check;
ALTER TABLE shared_media ADD CONSTRAINT shared_media_status_check
  CHECK (status IN ('processing', 'ready', 'failed', 'draft'));

-- 5. Add boards beta feature column (2026-03-14)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS boards BOOLEAN DEFAULT FALSE;

-- 6. Add collaborative chat support (2026-03-15)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_chat_threads_permissions ON chat_threads USING gin (permissions);

-- 7. Add thread_type to chat_threads (2026-03-16)
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS thread_type VARCHAR(20) DEFAULT 'chat';
CREATE INDEX IF NOT EXISTS idx_chat_threads_type ON chat_threads(user_id, thread_type, updated_at DESC);

-- ============================================================================
-- Done. Verify with:
--   \d profiles
--   \d chat_threads
--   \d chat_messages
--   \d shared_media
-- ============================================================================
