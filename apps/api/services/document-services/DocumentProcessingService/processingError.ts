/**
 * Was von einem gescheiterten Ingest an der Zeile steht (`metadata.processing_error`)
 * und in der Quellenliste des Notebooks angezeigt wird.
 *
 * Dort stand bis 11/2026 die rohe `error.message` — bei einer kaputten PNG etwa
 * „Mistral OCR extraction failed: API error occurred: Status 400 Body: {…}“:
 * Anbietername, HTTP-Status und JSON-Rumpf, nichts davon hilft der Person weiter.
 * Die Rohmeldung gehört ins Log (der Worker protokolliert sie vor dem Aufruf).
 */
import { classifyProviderError } from '../../providers/providerErrors.js';

/** Eine Meldung, die wir für Nutzer*innen geschrieben haben — sie wird unverändert gezeigt. */
export class DocumentReadError extends Error {
  override name = 'DocumentReadError';
}

export const NO_TEXT_MESSAGE =
  'Aus diesem Dokument konnte kein Text gelesen werden. Prüfe, ob die Datei Text enthält.';

const UNREADABLE_MESSAGE =
  'Diese Datei konnte nicht gelesen werden. Ist sie beschädigt oder passwortgeschützt? Speichere sie als PDF oder DOCX und lade sie erneut hoch.';

const UNAVAILABLE_MESSAGE =
  'Der Dienst zum Auslesen ist gerade nicht erreichbar. Versuche es später über „Neu indexieren“.';

/** Die OCR-Anbieter melden ein Bild ohne Schrift als Fehler, nicht als leeren Text. */
const NO_TEXT_SIGNATURE = /no text extracted|returned no text/i;

export function processingErrorMessage(error: unknown): string {
  if (error instanceof DocumentReadError) return error.message;
  const raw = error instanceof Error ? error.message : '';
  if (NO_TEXT_SIGNATURE.test(raw)) return NO_TEXT_MESSAGE;
  return classifyProviderError(error).retryable ? UNAVAILABLE_MESSAGE : UNREADABLE_MESSAGE;
}
