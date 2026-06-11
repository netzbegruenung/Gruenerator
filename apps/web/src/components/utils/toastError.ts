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
  authUnavailable: 'api-error-auth-unavailable',
  generic: 'api-error-generic',
} as const;

/**
 * Errors reach this layer in two shapes: raw AxiosErrors (status under
 * `response.status`) and ApiErrors thrown by `handleApiError` in apiClient.ts
 * (plain Errors carrying `.status`, `.errorId` and the original AxiosError
 * under `.originalError`). Both must resolve, or the 401/404 skip and the
 * status-based messages silently fall back to the generic toast.
 */
interface ApiErrorLike {
  status?: number;
  errorId?: string;
  message?: string;
  response?: AxiosError['response'];
  originalError?: AxiosError;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
  errorId?: string;
}

function resolveStatus(error: unknown): number | undefined {
  const e = error as ApiErrorLike | undefined;
  return e?.response?.status ?? e?.status ?? e?.originalError?.response?.status;
}

function resolveBody(error: unknown): ApiErrorBody | null {
  const e = error as ApiErrorLike | undefined;
  const data = e?.response?.data ?? e?.originalError?.response?.data;
  return typeof data === 'object' && data !== null ? (data as ApiErrorBody) : null;
}

function readRetryAfterSeconds(error: unknown): number | null {
  const e = error as ApiErrorLike | undefined;
  const headers = e?.response?.headers ?? e?.originalError?.response?.headers;
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
  const status = resolveStatus(error);

  // 401 is handled by the auth-redirect layer (apiClient interceptor + AuthRoute).
  // Toasting "Authentifizierungsfehler" on every logged-out page load is noise.
  // 404 typically reflects a stale or wrong URL — callers show inline empty states.
  if (status === 401 || status === 404) return;

  const body = resolveBody(error);

  // The backend's "auth backend is down" signal (authMiddleware 503). The
  // session is NOT expired — say so explicitly, the generic 5xx wording
  // would read like data loss.
  if (status === 503 && body?.error === 'auth_unavailable') {
    const { title, message } = getErrorMessage({ code: 'auth_unavailable' });
    toast.error(title, {
      id: TOAST_IDS.authUnavailable,
      description: message,
    });
    return;
  }

  const { title, message } = getErrorMessage(error);
  const retryAfter = status === 429 ? readRetryAfterSeconds(error) : null;

  // Prefer the backend-provided human message over the static dictionary —
  // it knows WHY the request failed ("Datei zu groß", "Notebook nicht
  // gefunden", …). The errorId lets support find the exact log line.
  const apiError = error as ApiErrorLike | undefined;
  const backendMessage =
    (typeof body?.message === 'string' && body.message) ||
    (apiError?.errorId && typeof apiError.message === 'string' ? apiError.message : null);
  const errorId = body?.errorId ?? apiError?.errorId;

  let description: string;
  if (retryAfter !== null) {
    description = `Bitte versuche es in ${retryAfter} Sekunden erneut.`;
  } else {
    description = backendMessage || message;
    if (errorId) {
      description += `\nFehler-ID: ${errorId}`;
    }
  }

  toast.error(title, {
    id: pickToastId(status),
    description,
  });
}
