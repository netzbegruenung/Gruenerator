-- Input tokens the provider served from its prompt cache. A share of
-- input_tokens, not in addition to it. Without the column nobody can tell
-- after a deploy whether a provider's prefix cache actually hits.
ALTER TABLE user_usage_daily ADD COLUMN IF NOT EXISTS cached_input_tokens BIGINT NOT NULL DEFAULT 0;
