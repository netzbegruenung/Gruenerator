import { SearchError } from '../../../utils/errors/classes.js';

import { type RemoteSourceId } from './ids.js';

export const sourceUnavailableMessage = (label: string): string =>
  `${label} gerade nicht erreichbar`;

/**
 * Die Quelle hat nicht geantwortet (Zeitüberschreitung, Netz, 5xx/429, offener
 * Breaker, fehlende Konfiguration, unerwartete Antwortform). Erbt von
 * `SearchError`, damit der Fehlerhandler der Suche den Code durchreicht —
 * Aufrufer erkennen den Ausfall an `code: 'SOURCE_UNAVAILABLE'` und dürfen ihn
 * nie als „keine Treffer" zeigen.
 */
export class RemoteSourceUnavailableError extends SearchError {
  readonly sourceId: RemoteSourceId;
  readonly label: string;

  constructor(sourceId: RemoteSourceId, label: string, cause: string) {
    super(sourceUnavailableMessage(label), 'SOURCE_UNAVAILABLE', { sourceId, cause });
    this.name = 'RemoteSourceUnavailableError';
    this.sourceId = sourceId;
    this.label = label;
  }
}

/**
 * Für Werkzeuge, die eine Remote-Sammlung nicht bedienen kann (Quellenliste,
 * Volltext, Durchsuchen): ein ausgesprochenes „geht hier nicht", nie eine leere
 * Liste, die wie „gibt es nicht" aussieht.
 */
export const notAvailableForRemote = (collectionName: string): string =>
  `Für „${collectionName}" ist das nicht verfügbar: die Quelle liegt bei einem externen Dienst, der nur die Suche anbietet. Nutze stattdessen die Suche im Notebook.`;

export function isSourceUnavailable(response: { success: boolean; code?: string | undefined }) {
  return !response.success && response.code === 'SOURCE_UNAVAILABLE';
}
