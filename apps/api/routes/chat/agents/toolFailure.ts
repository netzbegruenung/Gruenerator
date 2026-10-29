/**
 * Eine Fehlerform für alle Chat-Werkzeuge: Ursache, wenn möglich Befund (was
 * stattdessen vorliegt) und genau ein Satz nächster Schritt. Das Modell kann
 * nur umsteuern, wenn es weiß, WARUM etwas nichts geliefert hat — ein nacktes
 * „fehlgeschlagen" lässt es raten, und ein verschluckter Ausfall sieht aus
 * wie ein echtes „nichts gefunden".
 *
 * Zwei Leser, zwei Felder: `error` (Ursache + Befund) zeigt die Karte der
 * Person 1:1 (`toolResultSummary`), also steht dort nie eine Anweisung ans
 * Modell. Der nächste Schritt steht in `naechsterSchritt`; das Modell sieht das
 * Ergebnis-JSON ganz, der Split-Schreiber über `buildToolFailureNote`.
 *
 * Beide Felder und `fehlerArt` gehen über `tool_step_result` auf den Draht und
 * in den persistierten Schritt — die Karte liest nur `error`/`summary` und
 * ignoriert den Rest. Bewusst NICHT gestrippt: der Replay späterer Turns
 * (`mcpReplay`) serialisiert das Ergebnis-JSON, und dort soll das Modell den
 * nächsten Schritt weiter sehen.
 */

export const FEHLER_ARTEN = [
  'nicht_gefunden',
  'ungueltige_eingabe',
  'anbieter_ausfall',
  'zeitlimit',
  'keine_berechtigung',
  'nicht_verfuegbar',
  'teilweise',
] as const;

export type FehlerArt = (typeof FEHLER_ARTEN)[number];

export interface WerkzeugFehler {
  /** Ursache + Befund, personentauglich. */
  error: string;
  fehlerArt: FehlerArt;
  /** Anweisung ans Modell; fehlt, wenn es keinen sinnvollen Schritt gibt. */
  naechsterSchritt?: string;
}

interface WerkzeugFehlerInput {
  art: FehlerArt;
  ursache: string;
  befund?: string | null;
  naechsterSchritt?: string | null;
}

const mitPunkt = (s: string): string => {
  const t = s.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
};

/** `error` = „<Ursache>. <Befund>."; der nächste Schritt steht getrennt daneben. */
export function werkzeugFehler(input: WerkzeugFehlerInput): WerkzeugFehler {
  const teile = [input.ursache, input.befund]
    .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    .map(mitPunkt);
  const schritt = input.naechsterSchritt?.trim();
  return {
    error: teile.join(' '),
    fehlerArt: input.art,
    ...(schritt ? { naechsterSchritt: mitPunkt(schritt) } : {}),
  };
}

/** Ein echtes Leer: kein `error`, aber der Satz sagt, welche Filter gegriffen haben. */
export function leeresErgebnis(opts: { filter?: string | null; hinweis?: string | null } = {}): {
  resultCount: 0;
  hinweis: string;
} {
  const teile = ['Es liegt kein Treffer vor'];
  if (opts.filter && opts.filter.trim() !== '') teile[0] += ` (angewandte Filter: ${opts.filter})`;
  if (opts.hinweis && opts.hinweis.trim() !== '') teile.push(opts.hinweis);
  return { resultCount: 0, hinweis: teile.map(mitPunkt).join(' ') };
}

/** Status NUR im Kontext („HTTP 404", „status 503", „status code 429") — nie eine nackte Zahl. */
const HTTP_STATUS_RE = /\b(?:HTTP|status(?:\s*code)?)\s*[:=]?\s*([1-5]\d\d)\b/i;
const NETZ_CODE_RE =
  /^(?:ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR_\w+)$/;
const NETZ_TEXT_RE =
  /\b(?:ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE)\b|socket hang up|^fetch failed$|network (?:error|request failed|is unreachable)/i;

const asRec = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;

const asStatus = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 100 && v <= 599 ? v : null;

/** Lesbare Meldung für alles, was geworfen werden kann (kein „[object Object]"). */
export function beschreibeWurf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

/** Status und Netzcode aus den STRUKTURIERTEN Feldern, einschließlich `cause`. */
function strukturiert(err: unknown): { status: number | null; netz: boolean } {
  let status: number | null = null;
  let netz = false;
  let cur: unknown = err;
  for (let i = 0; i < 3 && cur != null; i += 1) {
    const r = asRec(cur);
    if (!r) break;
    status ??= asStatus(r.status) ?? asStatus(r.statusCode) ?? asStatus(asRec(r.response)?.status);
    if (typeof r.code === 'string' && NETZ_CODE_RE.test(r.code)) netz = true;
    cur = r.cause;
  }
  return { status, netz };
}

/**
 * Ordnet einen GEWORFENEN Fehler ein. `timedOut` kommt vom Wrapper (der
 * kennt seinen Timeout-Fehler). Der Status kommt aus `status`/`statusCode`/
 * `response.status` bzw. aus Text im Kontext, Netzfehler aus `cause.code`;
 * Unbekanntes bleibt als Originalmeldung im Befund, nie verloren.
 */
export function klassifiziereWurf(
  err: unknown,
  opts: { timedOut?: boolean; timeoutMs?: number | null } = {}
): WerkzeugFehler {
  const meldung = beschreibeWurf(err).trim() || 'unbekannter Fehler';
  if (opts.timedOut) {
    const sek = opts.timeoutMs ? ` nach ${Math.round(opts.timeoutMs / 1000)} s` : '';
    return werkzeugFehler({
      art: 'zeitlimit',
      ursache: `Zeitüberschreitung${sek}`,
      befund: 'Das späte Ergebnis wird verworfen',
      // Geprüft: Das Ergebnis wird in wrapTools verworfen, Dokument-, Präsentations-,
      // Tabellen-, PDF- und Board-Erzeugung prüfen vor dem Schreiben das Abbruchsignal
      // (`abandonedBeforeCommit`). Bei anderen Werkzeugen, die Bestehendes ändern, ist
      // das nicht gesichert — daher erst lesen.
      naechsterSchritt:
        'Ein einmaliger neuer Versuch ist zulässig: erzeugende Werkzeuge legen nach der Zeitgrenze nichts mehr an. Hat der Aufruf Bestehendes ändern sollen, prüfe erst lesend, ob die Änderung angekommen ist',
    });
  }
  const struct = strukturiert(err);
  const code =
    struct.status ??
    (HTTP_STATUS_RE.exec(meldung)?.[1] ? Number(HTTP_STATUS_RE.exec(meldung)![1]) : null);
  if (code === 401 || code === 403) {
    return werkzeugFehler({
      art: 'keine_berechtigung',
      ursache: 'Der Zugriff wurde abgelehnt',
      befund: `Originalmeldung: ${meldung}`,
      naechsterSchritt: 'Nicht erneut versuchen; sag der Person, dass hier der Zugriff fehlt',
    });
  }
  if (code === 404) {
    return werkzeugFehler({
      art: 'nicht_gefunden',
      ursache: 'Das Angefragte gibt es dort nicht',
      befund: `Originalmeldung: ${meldung}`,
      naechsterSchritt: 'Prüfe die Angabe (Adresse, ID) oder suche zuerst danach',
    });
  }
  if (code === 429) {
    return werkzeugFehler({
      art: 'anbieter_ausfall',
      ursache: 'Der Anbieter hat ein Limit gesetzt',
      befund: `Originalmeldung: ${meldung}`,
      naechsterSchritt: 'Später erneut versuchen, nicht direkt wiederholen',
    });
  }
  if ((code !== null && code >= 500) || struct.netz || NETZ_TEXT_RE.test(meldung)) {
    return werkzeugFehler({
      art: 'anbieter_ausfall',
      ursache: 'Der Dienst hinter dem Werkzeug ist gerade nicht erreichbar',
      befund: `Originalmeldung: ${meldung}`,
      naechsterSchritt:
        'Ein einziger neuer Versuch ist erlaubt, danach sag offen, dass es nicht geklappt hat',
    });
  }
  return werkzeugFehler({
    art: 'nicht_verfuegbar',
    ursache: 'Das Werkzeug ist mit einem Fehler abgebrochen',
    befund: `Originalmeldung: ${meldung}`,
  });
}
