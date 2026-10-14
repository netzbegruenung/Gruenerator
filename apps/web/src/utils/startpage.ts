import { type StartPage } from '@gruenerator/contracts';

/**
 * Chat und Arbeiten sind zwei Tabs derselben Seite. Jeder Tab hat einen Pfad,
 * damit Zurück, Neuladen und Lesezeichen ihn behalten; das nackte `/start` ist
 * der Tab aus der Startseiten-Einstellung (siehe `startTabPath`). Die Pfade stehen hier (und nicht in der
 * Umschaltleiste), damit Routing, Sidebar und Rücksprünge dieselbe Quelle lesen,
 * ohne die Komponente samt Animationsbibliothek zu importieren.
 */
export const START_PATH = '/start';

/** Öffnet `/start` auf einem bestimmten Tab, unabhängig von der Einstellung. */
export const startTabLink = (tab: StartPage): string => `${START_PATH}/${tab}`;

/**
 * Die Adresse eines Tabs für eine Person: ihr Standard-Tab ist das nackte
 * `/start`, nur der andere trägt ein Segment. So hat jede Ansicht genau eine
 * Adresse, und der Haupteinstieg bleibt ohne Zusatz.
 */
export const startTabPath = (tab: StartPage, home: StartPage): string =>
  tab === home ? START_PATH : startTabLink(tab);

/**
 * Beide Tabs teilen sich die Glas-Optik: Sidebar und Sidebar-Toggle schalten
 * dort in die durchsichtigere Variante. Kein `startsWith(START_PATH)`, weil
 * `/startseite` ebenfalls mit `/start` beginnt.
 */
export const isWorkplaceSurface = (pathname: string): boolean =>
  pathname === START_PATH || pathname.startsWith(`${START_PATH}/`);
