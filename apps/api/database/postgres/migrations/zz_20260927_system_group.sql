-- System-Projekt: genau eine Gruppe, in der alle Profile Mitglied sind und
-- nur Instanz-Admins teilen. Anlegen und Mitglieder-Sweep macht der Boot-Schritt
-- `ensureSystemGroup` (braucht einen Slug-Suffix aus TS).
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_single_system ON groups ((is_system)) WHERE is_system;
