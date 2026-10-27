/**
 * Ein Kanal für „das Backend startet gerade neu".
 *
 * Bei einem API-Neustart antwortet der vorgeschaltete nginx gut zehn Sekunden
 * lang auf jede Anfrage mit seiner eigenen 502-Seite. Ohne diesen Kanal wird
 * daraus ein Schwall einzelner Fehler — Toasts, leere Listen, GlitchTip-Events
 * („Agents konnten nicht geladen werden", Issue 700) —, obwohl nichts kaputt ist
 * und gleich alles wieder da ist.
 *
 * Erkannt wird der Neustart am Inhaltstyp: nginx liefert seine 502 als HTML,
 * die API antwortet auch im Fehlerfall immer mit JSON. Eine 502 der API selbst
 * (z. B. ein ausgefallener KI-Anbieter) ist also kein Neustart und bleibt ein
 * gewöhnlicher Fehler.
 *
 * Melden darf jeder Transport (geteilter axios-Client, Web-`apiClient`,
 * Chat-Fetch); wann das Backend wieder da ist, stellt die App fest und meldet
 * es über {@link reportServerBack}.
 */

type ServerRestartListener = (restarting: boolean) => void;

/**
 * Wie lange nach der Rückkehr späte Fehlschläge noch dem Neustart zugerechnet
 * werden: Anfragen, die während der Pause losgingen, scheitern erst nach ihren
 * Retries, und die sollen keinen Fehler-Toast mehr auslösen.
 */
const LATE_FAILURE_WINDOW_MS = 10_000;

const listeners = new Set<ServerRestartListener>();
let down = false;
let backAt = 0;

/** HTML-502 = nginx erreicht die API nicht. Eine JSON-502 kommt von der API selbst. */
export function isGatewayDownResponse(status: number, contentType: unknown): boolean {
  return (
    status === 502 && !(typeof contentType === 'string' && contentType.includes('application/json'))
  );
}

/** Vom Transport aufzurufen, sobald {@link isGatewayDownResponse} zutrifft. Idempotent. */
export function reportGatewayDown(): void {
  if (down) return;
  down = true;
  for (const listener of listeners) listener(true);
}

/** Von der App aufzurufen, sobald das Backend wieder antwortet. Idempotent. */
export function reportServerBack(): void {
  if (!down) return;
  down = false;
  backAt = Date.now();
  for (const listener of listeners) listener(false);
}

/** Läuft gerade ein Neustart — oder ist er so kurz vorbei, dass ein Fehler noch zu ihm gehört? */
export function isServerRestarting(): boolean {
  return down || Date.now() - backAt < LATE_FAILURE_WINDOW_MS;
}

/** @returns Abmeldefunktion. */
export function subscribeServerRestart(listener: ServerRestartListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
