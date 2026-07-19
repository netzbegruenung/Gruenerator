/**
 * Build a user-facing markdown error message to inject as the assistant's
 * final turn when a chat streaming request fails. Yielding this from the
 * adapter (instead of throwing) makes the failure visible in the conversation
 * with the user's question still right above it.
 */

import { type ChatErrorCode } from '@gruenerator/contracts';

/**
 * Typed failure parsed from a backend SSE `error` event. Carries the
 * machine-readable taxonomy (`code`/`retryable`/`retryAfterMs` from
 * @gruenerator/contracts chatErrorCodeSchema) alongside the server's curated
 * German message, so the UI can branch on cause instead of string-matching.
 */
export class ChatStreamError extends Error {
  readonly code?: string;
  readonly retryable?: boolean;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    meta?: { code?: string; retryable?: boolean; retryAfterMs?: number }
  ) {
    super(message);
    this.name = 'ChatStreamError';
    if (meta?.code != null) this.code = meta.code;
    if (meta?.retryable != null) this.retryable = meta.retryable;
    if (meta?.retryAfterMs != null) this.retryAfterMs = meta.retryAfterMs;
  }
}

/** Fallback copy per error code, used when the server sent no message. */
const CODE_FALLBACK_MESSAGES: Partial<Record<ChatErrorCode, string>> = {
  rate_limited: 'Anfragelimit erreicht. Bitte warte einen Moment und versuche es dann erneut.',
  provider_unavailable:
    'Der KI-Dienst ist gerade nicht erreichbar. Bitte versuche es in einem Moment erneut.',
  first_token_timeout:
    'Der KI-Dienst antwortet gerade nicht. Bitte versuche es in einem Moment erneut.',
  stream_interrupted:
    'Die Verbindung zum KI-Dienst wurde unterbrochen — die Antwort ist möglicherweise unvollständig.',
  unauthorized: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  invalid_request: 'Deine Anfrage konnte nicht verarbeitet werden.',
  internal: 'Es ist ein interner Fehler aufgetreten. Bitte versuche es erneut.',
};

function chatStreamErrorText(error: ChatStreamError): string {
  const base =
    error.message.trim() ||
    CODE_FALLBACK_MESSAGES[error.code as ChatErrorCode] ||
    'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.';

  if (error.code === 'rate_limited' && error.retryAfterMs) {
    const seconds = Math.ceil(error.retryAfterMs / 1000);
    return `⚠️ **${base}** Bitte versuche es in ${seconds} Sekunden erneut.`;
  }
  return `⚠️ **${base}**`;
}

export function streamErrorMessage(error: unknown, response?: Response): string {
  if (error instanceof ChatStreamError) {
    return chatStreamErrorText(error);
  }

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

  // Deliberately NOT the raw error.message: untyped errors carry provider/stack
  // internals that mean nothing to the user. Diagnostics go to the console.
  console.error('[streamErrorMessage] Unclassified stream error:', error);
  return '⚠️ **Es ist ein Fehler aufgetreten.** Bitte versuche es erneut.';
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
