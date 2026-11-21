-- Antragsgrün-Seiten, die eine Person selbst angelegt hat und mit dem Grünerator
-- verbindet (#5690), stehen in derselben Tabelle wie die vom Grünerator
-- angelegten. `kind` trennt sie, weil die Obergrenze fürs Anlegen nur die
-- angelegten zählt. Bestehende Zeilen sind alle angelegt.
ALTER TABLE antragsgruen_hosted_sites
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'created'
    CHECK (kind IN ('created', 'connected'));
