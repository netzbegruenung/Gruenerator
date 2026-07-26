-- Versandoptionen und eigenes Briefpapier je Briefkopf.
--
-- Die Brief-Geometrie folgt DIN 5008 Form B und ist damit für jeden digitalen
-- Versanddienst gültig. Was sich zwischen den Diensten UNTERSCHEIDET, ist genau
-- das hier — und es gehört den Nutzer*innen, nicht in eine Konstante im Code:
--
-- * dispatch_mode: 'fensterkuvert' druckt wie bisher, weil die Freimachung aufs
--   Kuvert kommt. 'direktfrankierung' hält oben rechts 74 × 40 mm frei, weil
--   Frankierung und Matchcode dort direkt aufs Blatt gedruckt werden; das Logo
--   rückt darunter.
-- * show_return_line: die kleine Absenderzeile im Sichtfenster. Wer den Absender
--   schon auf dem Briefbogen führt, will sie nicht doppelt.
-- * show_fold_marks: beim Selbstdruck eine Hilfe, beim Dienstleister überflüssig
--   — der faltet maschinell.
-- * stationery_file: eigener Briefbogen (PDF/PNG/JPG), der unter den Brieftext
--   gelegt wird. Trägt er Logo und Absender, zeichnet der Renderer beides nicht
--   noch einmal darüber.
ALTER TABLE user_letterheads
    ADD COLUMN IF NOT EXISTS dispatch_mode TEXT NOT NULL DEFAULT 'fensterkuvert',
    ADD COLUMN IF NOT EXISTS show_return_line BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS show_fold_marks BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS stationery_file TEXT;

-- Nur die zwei bekannten Werte: der Renderer verzweigt darauf, ein Tippfehler
-- in der Spalte fiele sonst erst am fertigen PDF auf.
ALTER TABLE user_letterheads
    DROP CONSTRAINT IF EXISTS user_letterheads_dispatch_mode_check;
ALTER TABLE user_letterheads
    ADD CONSTRAINT user_letterheads_dispatch_mode_check
    CHECK (dispatch_mode IN ('fensterkuvert', 'direktfrankierung'));
