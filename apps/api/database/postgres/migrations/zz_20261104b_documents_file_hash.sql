-- SHA-256 über die rohen Bytes eines hochgeladenen Dokuments (#5342).
-- Damit erkennt der Upload in ein Notebook, dass dieselbe Datei dort schon
-- liegt. Kein Backfill: die Dateien bestehender Zeilen liegen nach dem Ingest
-- nicht mehr auf der Platte. Für Zeilen ohne Hash vergleicht der Upload
-- Dateiname und Größe.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_hash TEXT;
