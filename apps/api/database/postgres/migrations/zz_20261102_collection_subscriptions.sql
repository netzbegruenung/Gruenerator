-- Abonnierte Kollektionen: welche Kollektionen des Marktplatzes eine Person
-- zu sich geholt hat. Nur ein Verweis auf die Kollektions-Id aus dem Client-
-- Register (`collection_id`, F0) — kein Inhalt, deshalb kein Papierkorb; mit
-- dem Konto geht die Liste. Kein CHECK auf die Id, weil das Enum im Code
-- wächst; unbekannte Ids filtert der Service beim Lesen.
CREATE TABLE IF NOT EXISTS collection_subscriptions (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    collection_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, collection_id)
);
