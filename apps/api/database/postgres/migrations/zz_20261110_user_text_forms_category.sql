-- Eigene Rezepte tragen eine Kategorie wie die mitgelieferten (Presse, Social
-- Media, …): die Bibliothek gruppiert danach. NULL = keine gewählt, die
-- Bibliothek stellt solche Rezepte in die Gruppe „Eigene".
ALTER TABLE user_text_forms
    ADD COLUMN IF NOT EXISTS skill_category TEXT NULL
        CHECK (skill_category IN ('presse', 'social', 'dokumente', 'recherche', 'sonstiges'));
