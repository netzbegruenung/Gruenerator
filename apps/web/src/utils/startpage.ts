import { type StartPage } from '@gruenerator/contracts';

/**
 * Chat und Arbeiten sind zwei Tabs derselben Seite `/start`. Welcher Tab beim
 * Öffnen zu sehen ist, entscheidet die Seite selbst: `?page=` vor der
 * Startseiten-Einstellung des Profils. Die Pfade stehen hier (und nicht in der
 * Umschaltleiste), damit Routing, Sidebar und Rücksprünge dieselbe Quelle lesen,
 * ohne die Komponente samt Animationsbibliothek zu importieren.
 */
export const START_PATH = '/start';

/** Öffnet `/start` auf einem bestimmten Tab, unabhängig von der Einstellung. */
export const startTabLink = (tab: StartPage): string => `${START_PATH}?page=${tab}`;

/**
 * Beide Tabs teilen sich die Glas-Optik: Sidebar und Sidebar-Toggle schalten
 * dort in die durchsichtigere Variante. Exakter Vergleich, weil `/startseite`
 * ebenfalls mit `/start` beginnt.
 */
export const isWorkplaceSurface = (pathname: string): boolean => pathname === START_PATH;
