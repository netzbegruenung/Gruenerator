/**
 * Selbstheilung alter Wolke-Punkte: vor `wolke://` stand der Freigabe-Link samt
 * Token in `source_url` (`buildLegacyWolkeFileUrl`). Liegt eine Datei nur unter
 * der Altform, schreibt der Scraper deren `source_url` um, bevor das
 * ETag-Gatter fragt — sonst fände es nichts und läse die Datei neu aus.
 *
 * Liegen beide Formen, gibt es schon zwei Chunk-Sätze; ein Umschreiben legte
 * sie unter einer URL zusammen. Das bleibt gemeldet und unangetastet.
 */
export type WolkeUrlAction = 'migrate' | 'none' | 'duplicate';

export function decideWolkeUrlMigration(stored: {
  newExists: boolean;
  legacyExists: boolean;
}): WolkeUrlAction {
  if (!stored.legacyExists) return 'none';
  return stored.newExists ? 'duplicate' : 'migrate';
}
