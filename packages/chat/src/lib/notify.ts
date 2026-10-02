/**
 * User-facing notices for failures that no assistant answer can explain.
 *
 * The primary channel for a degraded turn is the ANSWER itself — the backend
 * hands the model a degradation note and the reply says what went wrong. These
 * toasts are the fallback for everything outside that path: click-path
 * failures (export, share, move) and stream-level breakage where no model is
 * left to speak.
 *
 * A host that does not ship sonner (mobile) renders the notice itself through
 * `ChatConfig.notify`. Without that hook sonner is imported dynamically, so a
 * host with neither keeps only the console line.
 */
import { type NotifyKind, useChatConfigStore } from '../stores/chatConfigStore';

function toastLater(kind: NotifyKind, message: string, description?: string): void {
  const hostNotify = useChatConfigStore.getState().notify;
  if (hostNotify) {
    hostNotify(kind, message, description);
    return;
  }
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
