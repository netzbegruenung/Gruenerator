-- User agents render a react-icons Phosphor icon (component name, e.g. PiSparkle)
-- chosen in the agent creator. Nullable: legacy rows fall back to the emoji avatar.
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS icon_key text;
