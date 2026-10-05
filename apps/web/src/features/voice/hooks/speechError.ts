import { speechErrorSchema } from '@gruenerator/contracts';
import { ApiError } from '@gruenerator/shared/api';
import * as Sentry from '@sentry/react';
import { isAxiosError } from 'axios';

/**
 * Only `error` is required: the prefix middleware on /api/voice (requireAuth,
 * requireAiConsent, the rate limiter) answers before the router and leaves out
 * `success: false`.
 */
const serverErrorBody = speechErrorSchema.pick({ error: true });

/**
 * The server writes its error bodies for people, so a body that matches the
 * contract is shown as it is. Anything else did not come from the speech
 * router — a gateway 502/504 page or ts-rest's validation 400 — and the status
 * is all there is to go on. It is kept on the error and reported, because
 * "fehlgeschlagen" without it left GlitchTip issue 674 undiagnosable.
 */
export function speechApiError(
  operation: 'generate' | 'draftScript',
  result: { status: number; body: unknown },
  fallback: string
): ApiError {
  const parsed = serverErrorBody.safeParse(result.body);
  if (parsed.success) return new ApiError(result.status, parsed.data.error);

  const error = new ApiError(result.status, unexpectedMessage(result.status, fallback));
  Sentry.captureException(error, {
    tags: { speechOperation: operation, httpStatus: result.status },
  });
  return error;
}

function unexpectedMessage(status: number, fallback: string): string {
  if (status >= 500) {
    return 'Der Server war gerade nicht erreichbar. Bitte versuch es in einem Moment noch einmal.';
  }
  if (status === 400) {
    return 'Die Eingabe wurde nicht angenommen. Bitte prüf Text und Einstellungen.';
  }
  return fallback;
}

/**
 * The request never got an answer (offline, connection dropped, client
 * timeout). axios' own English message would land in the page's alert, and the
 * alert is the only feedback, since the hooks opt out of the global toast.
 */
export function speechRequestError(error: unknown): never {
  if (isAxiosError(error) && !error.response) {
    throw new Error(
      error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
        ? 'Die Anfrage hat zu lange gedauert. Bitte versuch es noch einmal.'
        : 'Keine Verbindung zum Server. Bitte prüf Deine Internetverbindung.',
      { cause: error }
    );
  }
  throw error;
}
