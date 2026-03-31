-- Fix collaborative_presentations.user_id: TEXT → UUID
-- The column stores UUID values but was typed as TEXT, causing
-- "operator does not exist: text = uuid" on JOINs with profiles.

ALTER TABLE collaborative_presentations
  ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
