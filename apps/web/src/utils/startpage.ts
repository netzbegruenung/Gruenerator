import { type StartPage } from '@gruenerator/contracts';

/**
 * Chat und Arbeiten sind zwei eigenständige Top-Level-Seiten, keine Tabs unter
 * einem gemeinsamen Präfix. Die Pfade stehen hier (und nicht in der
 * Umschaltleiste), damit Routing, Sidebar und Startseiten-Einstellung dieselbe
 * Quelle lesen, ohne die Komponente samt Animationsbibliothek zu importieren.
 */
export const CHAT_PATH = '/start';
export const ARBEITEN_PATH = '/workplace';

/**
 * Maps a user's default-start-page preference to the route the sidebar "start"
 * icon and the root/login redirect should open. Falls back to the Chat surface
 * (the historical default) for anything unset or unrecognised.
 */
export const startPagePath = (preference?: StartPage | null): string =>
  preference === 'arbeiten' ? ARBEITEN_PATH : CHAT_PATH;

/**
 * Beide Flächen teilen sich die Glas-Optik: Sidebar und Sidebar-Toggle schalten
 * dort in die durchsichtigere Variante. Exakter Vergleich, weil `/startseite`
 * ebenfalls mit `/start` beginnt.
 */
export const isWorkplaceSurface = (pathname: string): boolean =>
  pathname === CHAT_PATH || pathname === ARBEITEN_PATH;
