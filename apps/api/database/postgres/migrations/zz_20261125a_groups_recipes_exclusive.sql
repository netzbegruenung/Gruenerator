-- Project switch "Nur Projekt-Rezepte verwenden": chats inside the project
-- only self-load the project's own writing recipes (methods stay available,
-- an explicit @-mention still works). Default off.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS recipes_exclusive BOOLEAN NOT NULL DEFAULT FALSE;
