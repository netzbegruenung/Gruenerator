import { type StartPage } from '@gruenerator/contracts';

/**
 * Chat und Arbeiten sind zwei Tabs derselben Seite. Jeder Tab hat seinen
 * eigenen Pfad (`/start/chat`, `/start/arbeiten`), damit Zurück, Neuladen und
 * Lesezeichen den Tab behalten; das nackte `/start` öffnet den Tab aus der
 * Startseiten-Einstellung. Die Pfade stehen hier (und nicht in der
 * Umschaltleiste), damit Routing, Sidebar und Rücksprünge dieselbe Quelle lesen,
 * ohne die Komponente samt Animationsbibliothek zu importieren.
 */
export const START_PATH = '/start';

/** Öffnet `/start` auf einem bestimmten Tab, unabhängig von der Einstellung. */
export const startTabLink = (tab: StartPage): string => `${START_PATH}/${tab}`;

/**
 * Beide Tabs teilen sich die Glas-Optik: Sidebar und Sidebar-Toggle schalten
 * dort in die durchsichtigere Variante. Kein `startsWith(START_PATH)`, weil
 * `/startseite` ebenfalls mit `/start` beginnt.
 */
export const isWorkplaceSurface = (pathname: string): boolean =>
  pathname === START_PATH || pathname.startsWith(`${START_PATH}/`);
