/**
 * Wie viele Werkzeugaufrufe eines Zuges gerade LAUFEN — geteilt zwischen dem
 * Werkzeug-Umschlag (`wrapToolsForLoop`), der es zählt, und der Stillstands-
 * Uhr der Werkzeugphase (`loopEngine`), die es liest.
 *
 * Eigenes, importfreies Modul, weil sonst genau die Kante entstünde, die es
 * vermeidet: die Uhr wird IM Motor gestellt, der Zähler wird VOR dem Motor
 * gefüllt (der Umschlag entsteht im aufrufenden Dienst). Ein gemeinsamer,
 * abhängigkeitsfreier Zähler ist die einzige Verbindung, die beide brauchen.
 *
 * Warum überhaupt gezählt wird: die AI-SDK-Schleife führt Werkzeuge WÄHREND des
 * Auslesens des Streams aus. Ein laufender Aufruf blockiert den Iterator also
 * legitim — bei den Erzeugungswerkzeugen bis zu 90 s (TOOL_TIMEOUT_OVERRIDES_MS).
 * Ohne diesen Zähler müsste die Stillstands-Uhr über diesem Wert liegen und
 * verlöre damit ihren Sinn.
 */

export interface ToolActivity {
  /** Ein Aufruf beginnt. */
  begin: () => void;
  /** Ein Aufruf ist fertig (Erfolg, Fehler oder Zeitüberschreitung). */
  end: () => void;
  /** Wie viele gerade laufen. Parallele Aufrufe eines Schritts zählen einzeln. */
  inFlight: () => number;
}

export function createToolActivity(): ToolActivity {
  let running = 0;
  return {
    begin: () => {
      running += 1;
    },
    end: () => {
      // Nie unter null: ein doppelter `end` (abgebrochener Aufruf, der doch noch
      // zurückkommt) darf die Uhr nicht fälschlich für frei erklären.
      running = Math.max(0, running - 1);
    },
    inFlight: () => running,
  };
}
