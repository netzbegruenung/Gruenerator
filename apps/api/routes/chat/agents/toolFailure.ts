/**
 * Eine Fehlerform für alle Chat-Werkzeuge: Ursache, wenn möglich Befund (was
 * stattdessen vorliegt) und genau ein Satz nächster Schritt. Das Modell kann
 * nur umsteuern, wenn es weiß, WARUM etwas nichts geliefert hat — ein nacktes
 * „fehlgeschlagen" lässt es raten, und ein verschluckter Ausfall sieht aus
 * wie ein echtes „nichts gefunden".
 *
 * `error` bleibt das Feld, das Karte, persistierte Schritte und
 * `toolOutcome.ts` lesen; `fehlerArt` ist rein serverseitig und kommt nirgends
 * auf den Draht (die Karte nimmt nur `error`).
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
  error: string;
  fehlerArt: FehlerArt;
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

/** `<Ursache>. <Befund>. <Nächster Schritt>` — fehlende Teile entfallen. */
export function werkzeugFehler(input: WerkzeugFehlerInput): WerkzeugFehler {
  const teile = [input.ursache, input.befund, input.naechsterSchritt]
    .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    .map(mitPunkt);
  return { error: teile.join(' '), fehlerArt: input.art };
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

const HTTP_STATUS_RE =
  /\b(?:status(?: code)?|HTTP|http)\D{0,3}(\d{3})\b|\b(401|403|404|429|5\d\d)\b/;
const NETZ_RE =
  /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|UND_ERR|fetch failed|socket hang up|network/i;

/**
 * Ordnet einen GEWORFENEN Fehler ein. `timedOut` kommt vom Wrapper (der
 * kennt seinen Timeout-Fehler), alles andere wird an Status und Netzcodes
 * erkannt. Unbekanntes bleibt als Originalmeldung im Befund, nie verloren.
 */
export function klassifiziereWurf(
  raw: string,
  opts: { timedOut?: boolean; timeoutMs?: number | null } = {}
): WerkzeugFehler {
  const meldung = raw.trim() || 'unbekannter Fehler';
  if (opts.timedOut) {
    return werkzeugFehler({
      art: 'zeitlimit',
      ursache: `Zeitüberschreitung: Das Werkzeug hat nicht rechtzeitig geantwortet${opts.timeoutMs ? ` (nach ${opts.timeoutMs} ms)` : ''}`,
      befund: 'Es läuft möglicherweise noch weiter und kann sein Ergebnis später nachliefern',
      naechsterSchritt:
        'Nicht sofort mit denselben Argumenten wiederholen und nichts doppelt erstellen; sag offen, dass es dauert, oder versuche es mit engeren Angaben',
    });
  }
  const status = HTTP_STATUS_RE.exec(meldung);
  const code = status ? Number(status[1] ?? status[2]) : null;
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
  if ((code !== null && code >= 500) || NETZ_RE.test(meldung)) {
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
