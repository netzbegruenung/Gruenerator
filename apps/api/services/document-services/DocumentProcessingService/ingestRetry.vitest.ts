/**
 * Ein Ausfall beim Anbieter (Mistral 503, Zeitüberschreitung, Netz) ist nicht
 * die Schuld der Datei: der Worker versucht es von selbst wieder. Was an der
 * Datei liegt, scheitert sofort — sonst wartet eine kaputte Datei über eine
 * Stunde auf ihr ehrliches „nicht lesbar".
 */
import { describe, it, expect } from 'vitest';

import { ingestRetryDelayMs, INGEST_RETRY_DELAYS_MS } from './ingestRetry.js';

const status = (code: number) => Object.assign(new Error(`Status ${code}`), { statusCode: code });

describe('ingestRetryDelayMs', () => {
  it('wartet bei 5xx, 429 und Netzfehlern mit wachsendem Abstand', () => {
    expect(ingestRetryDelayMs(status(503), 0)).toBe(INGEST_RETRY_DELAYS_MS[0]);
    expect(ingestRetryDelayMs(status(429), 1)).toBe(INGEST_RETRY_DELAYS_MS[1]);
    expect(ingestRetryDelayMs(new Error('fetch failed'), 2)).toBe(INGEST_RETRY_DELAYS_MS[2]);
  });

  it('erkennt den Status auch unter einer umverpackten Fehlermeldung', () => {
    const wrapped = new Error('Mistral OCR extraction failed: Service unavailable', {
      cause: status(503),
    });
    expect(ingestRetryDelayMs(wrapped, 0)).toBe(INGEST_RETRY_DELAYS_MS[0]);
  });

  it('gibt nach dem letzten Abstand auf', () => {
    expect(ingestRetryDelayMs(status(503), INGEST_RETRY_DELAYS_MS.length)).toBeNull();
  });

  it('wiederholt nicht, was an der Datei oder an uns liegt', () => {
    expect(ingestRetryDelayMs(status(400), 0)).toBeNull();
    expect(
      ingestRetryDelayMs(new Error('Aus diesem Dokument konnte kein Text gelesen werden.'), 0)
    ).toBeNull();
    expect(ingestRetryDelayMs(new Error('Uploaded file not found on disk'), 0)).toBeNull();
  });
});
