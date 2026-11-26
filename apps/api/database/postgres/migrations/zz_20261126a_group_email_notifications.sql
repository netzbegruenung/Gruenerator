-- Projekt-E-Mails je Mitgliedschaft: 'all' (jede Projekt-Neuigkeit, soweit die
-- persönlichen Benachrichtigungs-Einstellungen sie zulassen), 'mentions' (nur
-- was die Person direkt angeht: Erwähnungen, @alle, Beitritt, Meldungen) oder
-- 'none'. Standard ist 'mentions', auch für bestehende Mitglieder: neue
-- Beiträge, Freigaben und Kommentare schickten jeder Person eine Mail.
-- Wer stummgeschaltet hatte (`notifications_muted`, F0, bleibt als Spiegel von
-- 'none' für ausgelieferte Apps), bekommt 'none'.
ALTER TABLE group_memberships
    ADD COLUMN IF NOT EXISTS email_notifications TEXT NOT NULL DEFAULT 'mentions'
        CHECK (email_notifications IN ('all', 'mentions', 'none'));

UPDATE group_memberships SET email_notifications = 'none' WHERE notifications_muted;
