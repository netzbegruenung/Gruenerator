-- Notion-style pretty URLs for chat threads (`/chat/<titel>-<suffix>`),
-- mirroring the group/notebook slug feature. The stable 6-char suffix is the
-- real lookup key; the title prefix is cosmetic.
--
-- Column is nullable so existing rows can sit NULL until the boot-time backfill
-- (backfillChatThreadSlugSuffixes.ts) fills them. The partial unique index
-- enforces collision-freeness only over assigned suffixes.

ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS slug_suffix TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_threads_slug_suffix ON chat_threads(slug_suffix) WHERE slug_suffix IS NOT NULL;
