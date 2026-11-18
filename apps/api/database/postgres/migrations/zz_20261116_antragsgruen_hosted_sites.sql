-- Antragsgrün-Seiten, die der Grünerator auf antragsgruen.de für eine Person
-- angelegt hat (`services/antragsgruen/hosting/`). Die Seite selbst lebt bei
-- Antragsgrün; die Zeile hält fest, wer sie bestellt hat — für die Obergrenze je
-- Person und für das spätere Verbinden der Seite mit dem Grünerator (#5690).
-- Kein Papierkorb: die Zeile ist kein Inhalt. Beim Löschen des Kontos bleibt sie
-- ohne Person stehen (SET NULL), weil die Seite bei Antragsgrün weiter existiert
-- und das Grünerator-Konto dort Admin bleibt.
CREATE TABLE IF NOT EXISTS antragsgruen_hosted_sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    subdomain TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_antragsgruen_hosted_sites_user ON antragsgruen_hosted_sites(user_id);
