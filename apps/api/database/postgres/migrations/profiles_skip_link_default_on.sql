-- WCAG 2.4.1 (Bypass Blocks) ist Level A und verlangt den Sprung-Link
-- unkonditioniert. Ein Schalter, den man erst finden muss, erfüllt das
-- Kriterium nicht. Die Einstellung bleibt erhalten — sie wird vom
-- "einschalten" zum "ausblenden".
ALTER TABLE profiles ALTER COLUMN show_skip_link SET DEFAULT TRUE;

-- Bestandskonten bewusst pauschal: der Schalter war von Anfang an aus, ein
-- aktives Opt-out ist vom Nie-Angefasst nicht unterscheidbar.
UPDATE profiles SET show_skip_link = TRUE WHERE show_skip_link = FALSE;
