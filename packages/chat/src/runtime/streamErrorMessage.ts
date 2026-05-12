/**
 * Build a user-facing markdown error message to inject as the assistant's
 * final turn when a chat streaming request fails. Yielding this from the
 * adapter (instead of throwing) makes the failure visible in the conversation
 * with the user's question still right above it.
 */
export function streamErrorMessage(error: unknown, response?: Response): string {
  const status = response?.status;

  if (status === 429) {
    const retryAfterRaw = response?.headers.get('retry-after');
    const retryAfter = parseRetryAfter(retryAfterRaw);
    if (retryAfter !== null) {
      return `⚠️ **Anfragelimit erreicht.** Bitte versuche es in ${retryAfter} Sekunden erneut.`;
    }
    return '⚠️ **Anfragelimit erreicht.** Bitte warte einen Moment und versuche es dann erneut.';
  }

  if (status === 401 || status === 403) {
    return '⚠️ **Sitzung abgelaufen.** Bitte melde dich erneut an.';
  }

  if (status && status >= 500) {
    return `⚠️ **Der Server konnte deine Anfrage nicht beantworten** (HTTP ${status}). Bitte versuche es in einem Moment erneut.`;
  }

  if (isNetworkError(error)) {
    return '⚠️ **Verbindung unterbrochen.** Bitte prüfe deine Internetverbindung und versuche es erneut.';
  }

  const message = error instanceof Error ? error.message : String(error ?? 'Unbekannter Fehler');
  return `⚠️ **Es ist ein Fehler aufgetreten.**\n\n${message}`;
}

function parseRetryAfter(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.ceil(asNumber);
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    const seconds = Math.ceil((asDate - Date.now()) / 1000);
    return seconds > 0 ? seconds : null;
  }
  return null;
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  return /network error|failed to fetch|load failed|error in input stream/i.test(error.message);
}
