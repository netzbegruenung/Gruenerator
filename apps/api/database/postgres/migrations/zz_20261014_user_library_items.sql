-- „Zu meinen Grüneratoren": was eine Person aus der Agentura auf ihre Übersicht
-- geholt hat. Nur ein Verweis — `item_ref` ist bei Agents der agentRef
-- (Identifier eines System-Agents, uuid eines Nutzer-Agents), bei Rezepten die
-- Mention. Kein Inhalt, deshalb kein Papierkorb; mit dem Konto geht die Liste.
CREATE TABLE IF NOT EXISTS user_library_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    item_kind TEXT NOT NULL CHECK (item_kind IN ('agent', 'recipe')),
    item_ref TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_library_items_unique UNIQUE (user_id, item_kind, item_ref)
);
