-- Notion-style pretty URLs for groups (`/gruppen/<name>-<suffix>`), mirroring
-- the notebook slug feature. The stable 6-char suffix is the real lookup key;
-- the name prefix is cosmetic. Legacy `/gruppen/<uuid>` links keep resolving.
--
-- Column is nullable so existing rows can sit NULL until the boot-time backfill
-- (backfillGroupSlugSuffixes.ts) fills them. The partial unique index enforces
-- collision-freeness only over assigned suffixes.

ALTER TABLE groups ADD COLUMN IF NOT EXISTS slug_suffix TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_slug_suffix ON groups(slug_suffix) WHERE slug_suffix IS NOT NULL;
