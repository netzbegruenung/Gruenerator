-- Convert legacy "Eigene Grüneratoren" (custom_generators) into real agents.
--
-- The custom-generators feature is being removed. Every owned, active generator
-- prompt is persisted as a `user_agents` row so it keeps working in the Agentur
-- (chatted with at /agents/cg-<slug>). Mirrors the now-removed
-- `customGeneratorToUserAgentInput()` mapping exactly.
--
-- Idempotent: the (user_id, identifier) unique constraint + ON CONFLICT skips
-- already-converted rows, so re-running is a no-op. Guarded by to_regclass()
-- because migrations run before schema-sync creates custom_generators on a
-- fresh DB (where there is no data to convert anyway).
--
-- Saved generators (saved from other users) are intentionally NOT converted —
-- agent sharing now happens via Groups. The source tables are left dormant.
--
-- No BEGIN/COMMIT: the migration runner wraps this file in a transaction.

DO $$
BEGIN
  IF to_regclass('public.custom_generators') IS NOT NULL
     AND to_regclass('public.user_agents') IS NOT NULL THEN
    INSERT INTO user_agents (
      user_id, identifier, title, description, system_role, avatar,
      background_color, tags, model, provider, params,
      opening_message, opening_questions, locale, author, enabled_tools
    )
    SELECT
      cg.user_id,
      'cg-' || cg.slug,
      cg.name,
      COALESCE(cg.description, 'Custom Grünerator: ' || cg.name),
      cg.prompt,
      '✨',
      '#316049',
      '["custom","converted"]'::jsonb,
      'mistral-large-latest',
      'mistral',
      '{"max_tokens":3000,"temperature":0.6}'::jsonb,
      'Hallo! Ich bin ' || cg.name || '. Wie kann ich helfen?',
      '[]'::jsonb,
      'de-DE',
      'Custom Grünerator',
      '["search","web"]'::jsonb
    FROM custom_generators cg
    WHERE cg.user_id IS NOT NULL AND cg.is_active = true
    ON CONFLICT (user_id, identifier) DO NOTHING;
  END IF;
END $$;
