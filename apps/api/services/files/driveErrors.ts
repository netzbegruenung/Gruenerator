/**
 * Fehler der Drive-Anbieter (OneDrive, Google Drive), ans MODELL gerichtet.
 *
 * Die Rohfehler (axios, Nango) tragen Tokens in Header und URLs und taugen nicht
 * für eine Modellantwort. Hier wird jeder Fehler zu einer deutschen
 * Handlungsanweisung mit einer `kind`, und nur diese Meldung verlässt den
 * Anbieter.
 */
import axios from 'axios';

import { CloudPathError } from '../../utils/validation/cloudPaths.js';

export type CloudAccessErrorKind =
  'reauth' | 'not_found' | 'rate_limit' | 'too_large' | 'unsupported' | 'unavailable';

export class CloudAccessError extends Error {
  constructor(
    readonly kind: CloudAccessErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'CloudAccessError';
  }
}

const REAUTH_HINT =
  'Der Zugriff wurde abgelehnt oder ist abgelaufen. Die Person muss die Verbindung in den Einstellungen unter Konnektoren neu verbinden — sag ihr das.';

export function reauthError(): CloudAccessError {
  return new CloudAccessError('reauth', REAUTH_HINT);
}

export function notFoundError(): CloudAccessError {
  return new CloudAccessError(
    'not_found',
    'Die Datei oder der Ordner wurde nicht gefunden — nimm nur Pfade aus einer list- oder find-Antwort.'
  );
}

/** Die `reason` eines Google-Fehlers (`error.errors[0].reason`), falls vorhanden. */
function googleReason(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const error = (data as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || typeof errors[0] !== 'object' || errors[0] === null) return null;
  const reason = (errors[0] as { reason?: unknown }).reason;
  return typeof reason === 'string' ? reason : null;
}

/**
 * Jeden Fehler eines Drive-Aufrufs in einen `CloudAccessError` überführen.
 * Pfadfehler (`CloudPathError`) und bereits übersetzte Fehler gehen unverändert
 * durch.
 */
export function toCloudAccessError(err: unknown): Error {
  if (err instanceof CloudAccessError || err instanceof CloudPathError) return err;
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const reason = googleReason(err.response?.data);
    if (status === 429 || (status === 403 && reason && /ratelimit|quota/i.test(reason))) {
      return new CloudAccessError(
        'rate_limit',
        'Der Anbieter hat die Anfragen vorübergehend begrenzt. Bitte in einer Minute erneut versuchen.'
      );
    }
    if (status === 403 && reason === 'exportSizeLimitExceeded') {
      return new CloudAccessError(
        'too_large',
        'Die Datei ist zu groß, um sie als Text zu exportieren (Grenze des Anbieters etwa 10 MB).'
      );
    }
    if (status === 401 || status === 403) return reauthError();
    if (status === 404) return notFoundError();
  }
  return new CloudAccessError(
    'unavailable',
    'Der Anbieter hat gerade nicht geantwortet. Bitte später erneut versuchen.'
  );
}

/** Führt `fn` aus und übersetzt jeden Fehler. */
export async function guardDriveCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toCloudAccessError(err);
  }
}
