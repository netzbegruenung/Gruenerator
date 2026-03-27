-- Add 'pending_review' and 'rejected' to user_templates status constraint
-- Enables approval workflow for user-submitted Vorlagen

ALTER TABLE user_templates DROP CONSTRAINT IF EXISTS valid_template_status;
ALTER TABLE user_templates ADD CONSTRAINT valid_template_status
  CHECK (status IN ('published', 'draft', 'archived', 'private', 'public', 'enabled', 'active', 'pending_review', 'rejected'));
