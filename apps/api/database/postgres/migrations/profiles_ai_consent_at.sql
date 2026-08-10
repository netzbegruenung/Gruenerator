-- Ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO in die
-- Verarbeitung besonderer Kategorien (politische Meinungen können sich aus den
-- Eingaben ergeben), die vor der ersten Nutzung der KI-Funktionen eingeholt
-- wird.
--
-- Zeitstempel statt Boolean: die Einwilligung muss nachweisbar sein (Art. 7
-- Abs. 1 DSGVO), und „wann" gehört zum Nachweis. NULL heißt „nicht erteilt bzw.
-- widerrufen" — ein Widerruf setzt die Spalte zurück, damit der Dialog beim
-- nächsten Aufruf wieder erscheint.
--
-- Bestandskonten starten bewusst auf NULL: eine Einwilligung, die nie
-- eingeholt wurde, darf nicht unterstellt werden.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_consent_at TIMESTAMPTZ;
