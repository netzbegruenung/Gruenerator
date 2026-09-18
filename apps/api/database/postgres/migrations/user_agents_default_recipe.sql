-- Default recipe binding for user agents (Agentura).
--
-- `skill_mentions` (see userAgents.ts) stays — F0, deprecated since 2026-09-18
-- — still read/written until the web bundle stops sending it (target
-- 2026-12-18), and column drops aren't allowed. The recipe an agent
-- auto-loads at chat time is bound here instead:
--   default_recipe_mention : mention-based lookup
--   default_recipe_id      : names a user recipe row (user_text_forms.id) —
--                            own, shared, or public — and wins over
--                            default_recipe_mention when set
--
-- Named to sort after create_user_agents.sql so the ALTERs always land on an
-- existing table on a fresh database.

ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS default_recipe_mention TEXT;
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS default_recipe_id UUID;
