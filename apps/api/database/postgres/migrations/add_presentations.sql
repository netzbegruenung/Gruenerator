-- Add collaborative presentations and slides tables
-- Mirrors the collaborative_documents pattern for presentation content

CREATE TABLE IF NOT EXISTS collaborative_presentations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Neue Präsentation',
  user_id UUID NOT NULL,
  language TEXT DEFAULT 'de',
  theme JSONB DEFAULT '{}',
  template TEXT DEFAULT 'general',
  permissions JSONB DEFAULT '{}',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS presentation_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id UUID NOT NULL REFERENCES collaborative_presentations(id) ON DELETE CASCADE,
  index INTEGER NOT NULL,
  layout_group TEXT NOT NULL DEFAULT 'general',
  layout TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  speaker_note TEXT,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presentations_user_id ON collaborative_presentations(user_id);
CREATE INDEX IF NOT EXISTS idx_presentations_updated_at ON collaborative_presentations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_presentation_slides_presentation_id ON presentation_slides(presentation_id);
CREATE INDEX IF NOT EXISTS idx_presentation_slides_order ON presentation_slides(presentation_id, index);
