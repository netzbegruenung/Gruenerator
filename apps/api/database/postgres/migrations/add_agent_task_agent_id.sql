-- Board agent tasks can be delegated to a specific agent (own / group-shared /
-- system) picked in a card comment @-mention or a card assignment. The chosen
-- agent's identifier is a TEXT slug (e.g. 'gruenerator-oeffentlichkeitsarbeit'),
-- never a UUID — so this column is TEXT and is never cast to ::uuid. Null = the
-- default universal agent (today's behaviour), preserved for backward compat.
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS agent_id TEXT;
