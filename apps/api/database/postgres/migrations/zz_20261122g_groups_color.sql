-- Optional tile colour per project, a key of the fixed palette (groupColorSchema).
ALTER TABLE groups ADD COLUMN IF NOT EXISTS color TEXT;
