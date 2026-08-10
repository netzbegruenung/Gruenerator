/**
 * Ein Kanal für die serverseitige Absage „Einwilligung fehlt" (HTTP 403,
 * `code: ai_consent_required`).
 *
 * Beide Einwilligungs-Dialoge hängen an genau einer Bedingung —
 * `user.ai_consent_at == null`. Damit ist die richtige Reaktion auf die Absage
 * nicht ein Fehler-Toast, sondern: den Wert im Auth-Store auf `null` ziehen,
 * woraufhin der Dialog von selbst erscheint. Der Server hat gerade gesagt, dass
 * er ihn dort sieht; der Store lag falsch.
 *
 * Warum eine Registrierung und kein direkter Store-Import: Web und Mobile
 * halten verschiedene Auth-Stores (`apps/web/src/stores/authStore` bzw. der
 * geteilte hier), und die Absage kann aus drei Transporten kommen — dem
 * geteilten axios-Client, dem Web-`apiClient` und dem SSE-Fetch im Chat.
 */

type AiConsentRequiredHandler = () => void;

let handler: AiConsentRequiredHandler | null = null;

/** Einmal beim Anlegen des Auth-Stores aufrufen. Der letzte Aufruf gewinnt. */
export function setAiConsentRequiredHandler(fn: AiConsentRequiredHandler | null): void {
  handler = fn;
}

/** Vom Transport aufzurufen, sobald eine 403 mit dem Einwilligungs-Code kommt. */
export function notifyAiConsentRequired(): void {
  handler?.();
}
