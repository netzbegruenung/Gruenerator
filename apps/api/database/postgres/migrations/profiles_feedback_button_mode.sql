-- Feedback-Button von An/Aus (feedback_enabled) auf ein Darstellungs-Setting
-- umstellen: 'text' (Pill, Default) | 'icon' | 'off'.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS feedback_button TEXT NOT NULL DEFAULT 'text'
    CHECK (feedback_button IN ('text', 'icon', 'off'));

-- Backfill nur, wenn die alte Spalte existiert — frische Installationen
-- (schema.sql) kennen feedback_enabled nicht mehr.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'feedback_enabled'
  ) THEN
    UPDATE profiles SET feedback_button = 'off' WHERE feedback_enabled = FALSE;
  END IF;
END $$;

ALTER TABLE profiles DROP COLUMN IF EXISTS feedback_enabled;
