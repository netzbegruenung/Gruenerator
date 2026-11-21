-- Agents laufen aus: die Besitzer*in wandelt einen eigenen Agent in ein Rezept
-- (user_text_forms) oder ein persönliches Projekt (groups) um. Umwandeln
-- kopiert — der Agent bleibt unverändert und merkt sich hier je Ziel seinen
-- Nachfolger, damit Editor, Detailseite und Chat auf ihn verweisen können und
-- ein zweiter Aufruf keine Dublette anlegt. Je Ziel eine Spalte: wer erst in
-- ein Projekt und dann in ein Rezept umwandelt, behält beide Verweise.
--
-- Kein FK auf groups/user_text_forms: beide werden nur in den Papierkorb
-- gelegt (deleted_at); der Dienst prüft beim nächsten Umwandeln, ob der
-- Nachfolger noch lebt, und legt sonst neu an.
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS migrated_recipe_id UUID;
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS migrated_project_id UUID;
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMPTZ;
