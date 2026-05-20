import { toast } from '@gruenerator/ui';

import { getErrorMessage } from './errorMessages';

import type { AxiosError } from 'axios';

/**
 * Stable toast IDs for dedup — 12 parallel failed requests collapse into 1 toast.
 */
const TOAST_IDS = {
  rateLimited: 'api-error-429',
  network: 'api-error-network',
  serverError: 'api-error-5xx',
  generic: 'api-error-generic',
} as const;

function readRetryAfterSeconds(error: unknown): number | null {
  const headers = (error as AxiosError | undefined)?.response?.headers;
  if (!headers) return null;
  const raw: unknown = headers['retry-after'] ?? headers['Retry-After'];
  if (!raw) return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.ceil(asNumber);
  const asDate = Date.parse(String(raw));
  if (Number.isFinite(asDate)) {
    const seconds = Math.ceil((asDate - Date.now()) / 1000);
    return seconds > 0 ? seconds : null;
  }
  return null;
}

function pickToastId(status: number | undefined): string {
  if (status === 429) return TOAST_IDS.rateLimited;
  if (status === undefined) return TOAST_IDS.network;
  if (status >= 500) return TOAST_IDS.serverError;
  return TOAST_IDS.generic;
}

/**
 * Surface an API error as a user-visible toast, using the shared German
 * error-message dictionary. Multiple concurrent failures with the same
 * category collapse into a single toast via sonner's id-based dedup.
 */
export function toastApiError(error: unknown): void {
  const status = (error as AxiosError | undefined)?.response?.status;

  // 401 is handled by the auth-redirect layer (apiClient interceptor + AuthRoute).
  // Toasting "Authentifizierungsfehler" on every logged-out page load is noise.
  // 404 typically reflects a stale or wrong URL — callers show inline empty states.
  if (status === 401 || status === 404) return;

  const { title, message } = getErrorMessage(error);
  const retryAfter = status === 429 ? readRetryAfterSeconds(error) : null;
  const description =
    retryAfter !== null ? `Bitte versuche es in ${retryAfter} Sekunden erneut.` : message;

  toast.error(title, {
    id: pickToastId(status),
    description,
  });
}
