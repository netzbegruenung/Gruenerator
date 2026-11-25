-- Projekt-Start: kurze Begrüßung und bis zu vier Startfragen je Projekt (Übersicht).
-- Liegt in der Zeile von group_instructions (group_id UNIQUE); die Anweisungs-Leser
-- filtern weiter auf instructions_enabled, eine Zeile nur mit Start bleibt für sie unsichtbar.
ALTER TABLE group_instructions ADD COLUMN IF NOT EXISTS welcome_message TEXT DEFAULT '';
ALTER TABLE group_instructions ADD COLUMN IF NOT EXISTS start_questions JSONB DEFAULT '[]'::jsonb;
