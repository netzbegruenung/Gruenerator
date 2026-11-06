import { cn } from '@gruenerator/ui';

import './wissenDashboard.css';

// Wiederkehrende Klassen des Wissens-Dashboards. Farben nur über die
// `--wd-*`-Tokens aus wissenDashboard.css; die Klassen stehen literal, damit
// Tailwind sie findet.

/** Weiße (dunkel: anthrazit) Inhaltskarte. */
export const WD_CARD = 'bg-(--wd-card)';
/** Magenta-getönte Kachel (Notebook-Kategorien, Composer-Knopf). */
export const WD_TINT = 'bg-(--wd-mg-tint)';
export const WD_TINT_HOVER = 'hover:bg-(--wd-mg-tint-2)';
export const WD_ACCENT_TEXT = 'text-(--wd-mg)';
export const WD_INK_TEXT = 'text-(--wd-mg-ink)';
export const WD_SUB_TEXT = 'text-(--wd-mg-sub)';
export const WD_HEADING = 'text-foreground-heading';
export const WD_MUTED = 'text-muted-foreground';
/**
 * Raleway für Kennzahlen und Kachel-Namen (Fließtext bleibt PT Sans). Das
 * Label `family-name:` ist Pflicht: ohne es hält tailwind-merge `font-[…]` für
 * eine Schriftstärke und streicht daneben stehendes `font-bold`.
 */
export const WD_DISPLAY = 'font-[family-name:Raleway,PT_Sans,Arial,sans-serif]';

/** Textlink im Akzent — „Mehr im Watcher", „Neues erstellen". */
export const WD_LINK = cn(
  'font-bold no-underline hover:underline',
  WD_ACCENT_TEXT,
  'hover:text-(--wd-mg-ink)'
);

/** Sichtbarer Fokus auf allen Karten und Knöpfen der Seite. */
export const WD_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--wd-mg) focus-visible:ring-offset-2 focus-visible:ring-offset-(--wd-page)';
