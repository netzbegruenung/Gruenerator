-- Reaktionen auf Vorlagen: Nutzer-Vorlagen (user_templates-UUID) und
-- Grünerator-Vorlagen aus dem privaten Katalog (String-id ohne DB-Zeile) teilen
-- sich eine TEXT-Spalte — dieselbe Schlüsselung wie entity_likes/entity_favorites
-- mit entity_type 'template'. Ohne FK: Katalog-Einträge haben keine Zeile.
ALTER TABLE entity_reactions ADD COLUMN IF NOT EXISTS template_id TEXT;

ALTER TABLE entity_reactions DROP CONSTRAINT IF EXISTS entity_reactions_one_target;
ALTER TABLE entity_reactions ADD CONSTRAINT entity_reactions_one_target
    CHECK (num_nonnulls(group_share_id, group_comment_id, board_comment_id, template_id) = 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_reactions_template
    ON entity_reactions (template_id, user_id, emoji) WHERE template_id IS NOT NULL;
