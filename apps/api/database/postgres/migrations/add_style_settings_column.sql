-- Add JSONB column for custom subtitle style settings (fontSize, bottomOffset, etc.)
ALTER TABLE subtitler_projects ADD COLUMN IF NOT EXISTS style_settings JSONB DEFAULT '{}';
