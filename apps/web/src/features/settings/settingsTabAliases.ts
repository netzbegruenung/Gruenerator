import { type SettingsTab } from './settingsDialogStore';

/**
 * Namen, die es mal gab — geteilte Links sollen nicht ins Leere laufen, und die
 * Suche findet über sie den Reiter, in dem das Gesuchte heute steht.
 *
 * Nur die *Aliasse* stehen hier. Die kanonischen Schlüssel kommen aus
 * `SETTINGS_TABS`, das der Compiler über `Record<SettingsTab, …>` vollständig
 * hält: eine von Hand gepflegte Zweitliste driftete sonst beim nächsten neuen
 * Reiter wieder ab — `/settings/datenschutz`, `/settings/websites` und
 * `/settings/barrierefreiheit` landeten so auf Allgemein.
 */
export const TAB_ALIASES: Record<string, SettingsTab> = {
  profil: 'allgemein',
  briefkoepfe: 'briefe',
  verbindungen: 'wolke',
  mcp: 'konnektoren',
  // Bis zum 16.11.2026 ein eigener Bereich, jetzt über dem Verbrauch in der Nutzung.
  baeume: 'nutzung',
  // Bis zum 28.08.2026 ein eigener Bereich, in „Datenschutz & Barrierefreiheit"
  // aufgegangen, seit 17.11.2026 die Gruppe „Bedienungshilfen" in Allgemein.
  barrierefreiheit: 'allgemein',
};
