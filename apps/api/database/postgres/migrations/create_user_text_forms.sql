-- Per-user "angelernte Textformen" (learned writing styles).
--
-- The user pastes up to N real examples per text form (Instagram/Facebook/Presse/
-- Antrag presets, or a custom form like "/omveinladungen"); an LLM distills the
-- commonalities into an editable style block. That block is injected at chat time
-- by the ChatGraph respond node when the matching skill/mention is active:
--   - preset  -> REPLACES the standard system-skill prompt (komplett ersetzen)
--   - custom  -> injected additively as "## AKTIVE TEXTFORM" onto the base agent
--
-- `mention` is the lookup key the runtime resolves the active mention against:
-- for presets it equals `text_type` (instagram/facebook/presse coincide with the
-- system-skill mentions; antrag stands alone), for custom forms a user slug.
-- `style_block` is the edited text — exactly what gets injected.

CREATE TABLE IF NOT EXISTS user_text_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom',          -- 'preset' | 'custom'
  text_type TEXT,                               -- 'instagram'|'facebook'|'presse'|'antrag' (presets only)
  mention TEXT NOT NULL,                         -- lookup key: preset=text_type, custom=slug
  title TEXT NOT NULL,
  examples JSONB NOT NULL DEFAULT '[]',          -- [{content}] raw pasted examples
  style_block TEXT NOT NULL DEFAULT '',          -- edited, injected markdown block
  model TEXT,                                     -- analysis model used
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_text_forms_user_mention_unique UNIQUE (user_id, mention)
);

CREATE INDEX IF NOT EXISTS idx_user_text_forms_user_id ON user_text_forms(user_id);
