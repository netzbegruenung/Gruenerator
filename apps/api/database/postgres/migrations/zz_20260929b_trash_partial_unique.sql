-- Papierkorb: eine getrashte Zeile darf ihren Schlüssel nicht 30 Tage lang
-- blockieren. Die Eindeutigkeit gilt deshalb nur noch unter den lebenden
-- Zeilen (`WHERE deleted_at IS NULL`). Wer neu anlegt, was im Papierkorb
-- liegt, bekommt den Schlüssel; die Wiederherstellung der alten Zeile
-- scheitert dann an 23505 und der Papierkorb antwortet 409.
--
-- Die alten Constraints tragen je nach Herkunft verschiedene Namen
-- (`schema.sql` benennt `UNIQUE(slug)` nicht, die Migrationen schon). Der
-- DO-Block löscht deshalb jeden Unique-Constraint mit genau dieser
-- Spaltenmenge, statt einen Namen zu raten.

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.conrelid::regclass::text AS tbl, c.conname
          FROM pg_constraint c
         WHERE c.contype = 'u'
           AND (c.conrelid::regclass::text,
                (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
                   FROM pg_attribute a
                  WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)))
               IN (('user_agents', ARRAY['identifier', 'user_id']),
                   ('user_text_forms', ARRAY['mention', 'user_id']),
                   ('user_sites', ARRAY['subdomain']),
                   ('custom_prompts', ARRAY['slug']),
                   ('custom_prompts', ARRAY['slug', 'user_id']))
    LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.tbl, r.conname);
    END LOOP;
END $$;

-- user_letterheads trägt einen Unique-INDEX, keinen Constraint.
DROP INDEX IF EXISTS user_letterheads_user_label_unique;

CREATE UNIQUE INDEX IF NOT EXISTS user_agents_user_identifier_unique
    ON user_agents (user_id, identifier) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_text_forms_user_mention_unique
    ON user_text_forms (user_id, mention) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_letterheads_user_label_unique
    ON user_letterheads (user_id, label) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_sites_subdomain_unique
    ON user_sites (subdomain) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS custom_prompts_slug_unique
    ON custom_prompts (slug) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS custom_prompts_user_slug_unique
    ON custom_prompts (user_id, slug) WHERE deleted_at IS NULL;
