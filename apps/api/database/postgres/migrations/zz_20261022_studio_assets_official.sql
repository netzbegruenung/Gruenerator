-- Official Sticker and Hintergründe: an instance admin marks a public studio
-- asset, and the Marktplatz lists it under „Offiziell“ instead of „Öffentlich“.
ALTER TABLE studio_assets ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT FALSE;
