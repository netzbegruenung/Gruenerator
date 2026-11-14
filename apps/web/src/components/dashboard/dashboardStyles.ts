import { cn } from '@gruenerator/ui';

import './dashboardTokens.css';

// Wiederkehrende Klassen der Dashboard-Seiten (/wissen, /briefing). Farben nur
// über die `--dash-*`-Tokens aus dashboardTokens.css; die Klassen stehen literal, damit
// Tailwind sie findet.

/** Weiße (dunkel: anthrazit) Inhaltskarte. */
// `dash-card` is a styling hook: the neutral variant (dashboardTokens.css) adds frame and shadow.
export const DASH_CARD = 'dash-card bg-(--dash-card)';
/** Magenta-getönte Kachel (Notebook-Kategorien, Composer-Knopf). */
export const DASH_TINT = 'bg-(--dash-mg-tint)';
export const DASH_TINT_HOVER = 'hover:bg-(--dash-mg-tint-2)';
export const DASH_ACCENT_TEXT = 'text-(--dash-mg)';
export const DASH_INK_TEXT = 'text-(--dash-mg-ink)';
export const DASH_SUB_TEXT = 'text-(--dash-mg-sub)';
export const DASH_HEADING = 'text-foreground-heading';
export const DASH_MUTED = 'text-muted-foreground';
/**
 * Raleway für Kennzahlen und Kachel-Namen (Fließtext bleibt PT Sans). Das
 * Label `family-name:` ist Pflicht: ohne es hält tailwind-merge `font-[…]` für
 * eine Schriftstärke und streicht daneben stehendes `font-bold`.
 */
export const DASH_DISPLAY = 'font-[family-name:Raleway,PT_Sans,Arial,sans-serif]';

/** Textlink im Akzent — „Mehr im Watcher", „Neues erstellen". */
export const DASH_LINK = cn(
  'font-bold no-underline hover:underline',
  DASH_ACCENT_TEXT,
  'hover:text-(--dash-mg-ink)'
);

/** Sichtbarer Fokus auf allen Karten und Knöpfen der Seite. */
export const DASH_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--dash-mg) focus-visible:ring-offset-2 focus-visible:ring-offset-(--dash-page)';
