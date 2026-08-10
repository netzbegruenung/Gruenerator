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
 *
 * **Ein Set, kein einzelner Platz.** Beide Stores tragen sich beim Modul-Laden
 * ein. Mit einem „letzter Aufruf gewinnt"-Slot hinge es an der
 * Auswertungsreihenfolge des Bundlers, wessen Eintrag überlebt — und der erste
 * künftige Import von `useAuth` aus `@gruenerator/shared` in `apps/web` würde
 * lautlos den falschen Store zurücksetzen, während `AiConsentGate` den lokalen
 * liest und den Dialog nie mehr zeigt. Alle eingetragenen Stores zu benach-
 * richtigen ist harmlos (wer keinen Zeitstempel hält, tut nichts) und macht
 * die Reihenfolge gleichgültig.
 */

type AiConsentRequiredHandler = () => void;

const handlers = new Set<AiConsentRequiredHandler>();

/**
 * Einmal beim Anlegen eines Auth-Stores aufrufen.
 * @returns Abmeldefunktion — für Tests, die den Kanal sauber hinterlassen wollen.
 */
export function registerAiConsentRequiredHandler(fn: AiConsentRequiredHandler): () => void {
  handlers.add(fn);
  return () => handlers.delete(fn);
}

/** Vom Transport aufzurufen, sobald eine 403 mit dem Einwilligungs-Code kommt. */
export function notifyAiConsentRequired(): void {
  for (const handler of handlers) handler();
}
