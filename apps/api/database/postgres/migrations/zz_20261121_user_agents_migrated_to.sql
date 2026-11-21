-- Agents laufen aus: die Besitzer*in wandelt einen eigenen Agent in ein Rezept
-- (user_text_forms) oder ein persönliches Projekt (groups) um. Umwandeln
-- kopiert — der Agent bleibt unverändert und merkt sich hier nur seinen
-- Nachfolger, damit Editor, Detailseite und Chat auf ihn verweisen können.
--
-- Kein FK: migrated_to_ref zeigt je nach migrated_to_kind in zwei Tabellen.
-- Ein gelöschter Nachfolger macht den Verweis nur stumpf; der Dienst prüft
-- beim nächsten Umwandeln, ob er noch lebt, und legt sonst neu an.
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS migrated_to_kind TEXT;
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS migrated_to_ref UUID;
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_agents_migrated_to_kind_check'
  ) THEN
    ALTER TABLE user_agents
      ADD CONSTRAINT user_agents_migrated_to_kind_check
      CHECK (migrated_to_kind IS NULL OR migrated_to_kind IN ('recipe', 'project'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_agents_migrated_to_pair'
  ) THEN
    ALTER TABLE user_agents
      ADD CONSTRAINT user_agents_migrated_to_pair
      CHECK ((migrated_to_kind IS NULL) = (migrated_to_ref IS NULL));
  END IF;
END $$;
