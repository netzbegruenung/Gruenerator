-- Die im Thread gewählte Rolle (Ebene + Bezeichnung).
--
-- Eine Katalogrolle bringt keinen `custom_system_prompt` mehr mit — ihr Auftrag
-- ist parteiintern und wird server-seitig aufgelöst. Ohne eine eigene Spalte
-- speicherte der Thread also gar nichts und fiel beim Neuladen stumm auf den
-- Chat-Modus zurück.

ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS role_ref JSONB DEFAULT NULL;
