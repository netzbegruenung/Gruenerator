/**
 * User-facing notices for failures that no assistant answer can explain.
 *
 * The primary channel for a degraded turn is the ANSWER itself — the backend
 * hands the model a degradation note and the reply says what went wrong. These
 * toasts are the fallback for everything outside that path: click-path
 * failures (export, share, move) and stream-level breakage where no model is
 * left to speak.
 *
 * sonner is imported dynamically because host apps that embed the chat package
 * (mobile) do not ship it — there the console line is the whole notice, which
 * is the established pattern (see dictationErrorHandler).
 */

function toastLater(kind: 'error' | 'warning', message: string, description?: string): void {
  void import('sonner')
    .then(({ toast }) => {
      toast[kind](message, description ? { description } : undefined);
    })
    .catch(() => {
      // sonner not installed in this host — the console line above is the notice.
    });
}

/** A failure the user asked for and did not get. */
export function notifyError(message: string, description?: string): void {
  console.error(`[notify] ${message}${description ? ` — ${description}` : ''}`);
  toastLater('error', message, description);
}

/** A degradation: the turn continued, but with less than the user expected. */
export function notifyWarning(message: string, description?: string): void {
  console.warn(`[notify] ${message}${description ? ` — ${description}` : ''}`);
  toastLater('warning', message, description);
}
