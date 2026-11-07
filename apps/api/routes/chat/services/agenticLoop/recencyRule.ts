/**
 * Die AKTUALITÄT-Regel — die einzige Anweisung im Chat, die dem Modell sagt,
 * was es mit dem Veröffentlichungsdatum einer Quelle anfangen soll.
 *
 * Eigene Datei, weil sie ZWEI Schreiber erreichen muss und trotzdem nur an
 * einem Ort stehen darf: den Reparatur-Schreiber (`buildRepairSystem`) und das
 * Loop-Modell (`buildToolUsageBlock`, #2954).
 */
export const RECENCY_RULE =
  'AKTUALITÄT: Hinter dem Titel steht, wo bekannt, das Veröffentlichungsdatum der Quelle. Widersprechen sich Quellen über einen JETZT-Zustand (Amt, Mandat, Mitgliedschaft, Preis, Stand eines Verfahrens), dann gilt die NEUESTE — nenne den Stand mit Datum ("seit September 2025 …"). Eine ältere Quelle im Präsens ("ist Bundesminister") beschreibt ihren Erscheinungszeitpunkt, nicht heute; übernimm sie nie als aktuellen Stand.';
