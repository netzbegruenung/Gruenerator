-- Briefköpfe (Absenderangaben) einer Nutzer*in.
--
-- Bewusst eine Tabelle statt zweier Profilspalten: wer für einen Kreisverband
-- UND eine Fraktion schreibt, braucht zwei Absender, und die Wahl gehört an den
-- Export — nicht in eine globale Einstellung, die man vorher umstellen muss.
--
-- `label` ist der Name im Auswahlmenü ("KV Musterstadt", "Fraktion im Rat") und
-- deshalb je Nutzer*in eindeutig. `organization` und `address` sind Freitext:
-- senderLines() splittet die Adresse auf '\n', und ein Straße/PLZ/Ort-Tripel
-- trägt weder "c/o Kreisgeschäftsstelle" noch ein österreichisches
-- "Stiege 2/Top 5".
--
-- Der Name kommt NICHT hierher — er wird aus dem Profil abgeleitet
-- (first_name/last_name, sonst display_name). Ein viertes Namensfeld hätte
-- keine Regel, welches gewinnt.
CREATE TABLE IF NOT EXISTS user_letterheads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    label TEXT NOT NULL,
    organization TEXT,
    address TEXT,

    -- Vorauswahl im Export. Über einen partiellen Unique-Index erzwungen, damit
    -- nicht zwei Zeilen gleichzeitig Standard sein können.
    is_default BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_letterheads_user_label_unique
    ON user_letterheads (user_id, label);

CREATE INDEX IF NOT EXISTS idx_user_letterheads_user_id
    ON user_letterheads (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS user_letterheads_one_default_per_user
    ON user_letterheads (user_id) WHERE is_default;
