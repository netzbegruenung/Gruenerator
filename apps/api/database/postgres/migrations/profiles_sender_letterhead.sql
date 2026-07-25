-- Absender für den PDF-Briefkopf (Einstellungen → Personalisierung).
-- Freitext und mehrzeilig: senderLines() splittet die Adresse auf '\n', und
-- Gliederungsadressen ("c/o Kreisgeschäftsstelle", "Stiege 2/Top 5") passen in
-- kein Straße/PLZ/Ort-Schema. Nullable und ohne DEFAULT — ein DEFAULT würde das
-- Feld in den abgeleiteten Typen zur Pflicht machen.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sender_organization TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sender_address TEXT;
