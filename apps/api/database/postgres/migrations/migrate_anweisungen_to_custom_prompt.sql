-- Migration: Merge per-generator Anweisungen into unified custom_prompt
-- Safe to run even if columns were already dropped (guards with column check).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'custom_antrag_prompt'
  ) THEN
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
  END IF;
END $$;

ALTER TABLE profiles DROP COLUMN IF EXISTS custom_antrag_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_social_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_universal_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_gruenejugend_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_rede_prompt;
ALTER TABLE profiles DROP COLUMN IF EXISTS custom_buergeranfragen_prompt;
