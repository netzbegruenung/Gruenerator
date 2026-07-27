-- Personalisation: background preset for the chat start tab.
-- Stores a preset KEY (sunrise/tanne/himmel/sand/magenta/neutral), not a colour,
-- so redesigning the gradients never needs a data migration. NULL = never chosen
-- → consumers fall back to `sunrise`, the historical default.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS chat_background TEXT;
