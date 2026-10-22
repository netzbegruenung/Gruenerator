-- Rezepte get the audience Vorlagen and Sticker already carry: the public
-- listing shows the viewer's country plus 'all'. Existing rows take their
-- owner's locale; profiles without one stay 'all'.
ALTER TABLE user_text_forms
    ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'all'
        CHECK (audience IN ('de-DE', 'de-AT', 'all'));

UPDATE user_text_forms tf
   SET audience = p.locale
  FROM profiles p
 WHERE p.id = tf.user_id
   AND p.locale IN ('de-DE', 'de-AT')
   AND tf.audience = 'all';

CREATE INDEX IF NOT EXISTS idx_user_text_forms_public_listing
    ON user_text_forms (audience, updated_at DESC)
    WHERE is_public = TRUE AND share_mode = 'authenticated' AND kind = 'custom'
      AND moderation = 'ok' AND deleted_at IS NULL;
