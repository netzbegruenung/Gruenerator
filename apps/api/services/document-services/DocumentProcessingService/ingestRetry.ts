/**
 * Wann der Ingest-Worker ein gescheitertes Dokument von selbst wieder versucht.
 *
 * Nur bei Fehlern, die nicht an der Datei liegen: ein Anbieter, der 5xx/429
 * meldet, eine Zeitüberschreitung, ein Netzfehler (`classifyProviderError`).
 * Die Clients wiederholen selbst schon im Sekundenbereich; ein Ausfall von
 * Minuten übersteht das nicht, und ohne diese Stufe stand das Dokument danach
 * auf `failed`, bis jemand von Hand „Neu indexieren" klickte.
 */
import { classifyProviderError } from '../../providers/providerErrors.js';

/** Abstand vor dem 1., 2., … Wiederholungsversuch — zusammen gut 80 Minuten. */
export const INGEST_RETRY_DELAYS_MS = [1, 5, 15, 60].map((min) => min * 60_000);

/** Wartezeit bis zum nächsten Versuch, oder `null`: aufgeben. */
export function ingestRetryDelayMs(error: unknown, retriesSoFar: number): number | null {
  if (!classifyProviderError(error).retryable) return null;
  return INGEST_RETRY_DELAYS_MS[retriesSoFar] ?? null;
}
