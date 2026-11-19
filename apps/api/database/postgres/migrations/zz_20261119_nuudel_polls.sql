-- nuudel-Umfragen, die der Grünerator auf nuudel.digitalcourage.de für eine
-- Person angelegt hat (`services/nuudel/`). Die Umfrage selbst lebt bei nuudel;
-- die Zeile hält fest, wem sie gehört, und trägt die Admin-ID — sie ist die
-- einzige Zugangsberechtigung zur Umfrage (Ergebnis lesen, bearbeiten, löschen)
-- und verlässt die API nur zur bestellenden Person.
-- Kein Papierkorb: die Zeile ist kein Inhalt. Mit dem Konto geht sie mit
-- (CASCADE); die Umfrage bei nuudel bleibt, bis nuudel sie nach Ablauf löscht.
CREATE TABLE IF NOT EXISTS nuudel_polls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('date', 'classic')),
    title TEXT NOT NULL,
    poll_id TEXT NOT NULL UNIQUE,
    admin_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nuudel_polls_user ON nuudel_polls(user_id, created_at DESC);
