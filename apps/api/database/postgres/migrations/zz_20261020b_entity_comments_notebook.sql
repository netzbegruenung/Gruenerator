-- Notebooks become a marketplace kind (#4733) and carry comments and item
-- reactions like the other kinds. `entity_comments.entity_type` got its CHECK
-- inline in zz_20261020_entity_comments.sql, so Postgres named it
-- `entity_comments_entity_type_check`.
ALTER TABLE entity_comments DROP CONSTRAINT IF EXISTS entity_comments_entity_type_check;
ALTER TABLE entity_comments ADD CONSTRAINT entity_comments_entity_type_check
    CHECK (entity_type IN ('agent', 'recipe', 'template', 'studio_asset', 'notebook'));

ALTER TABLE entity_reactions DROP CONSTRAINT IF EXISTS entity_reactions_item_type;
ALTER TABLE entity_reactions ADD CONSTRAINT entity_reactions_item_type
    CHECK (item_type IN ('agent', 'recipe', 'template', 'studio_asset', 'notebook'));
