-- Feedback-Button in den Einstellungen deaktivierbar machen.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS feedback_enabled BOOLEAN NOT NULL DEFAULT TRUE;
