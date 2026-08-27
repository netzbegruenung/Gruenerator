/**
 * Die AKTUALITÄT-Regel — die einzige Anweisung im Chat, die dem Modell sagt,
 * was es mit dem Veröffentlichungsdatum einer Quelle anfangen soll.
 *
 * Eigene Datei, weil sie ZWEI Schreiber erreichen muss und trotzdem nur an
 * einem Ort stehen darf: den Schreiber des split-Modus (`buildSynthSystem`)
 * und das eine Modell des unified-Modus (`buildToolUsageBlock`). Bis #2954 lag
 * sie nur im Quellenblock von `buildSynthSystem` — unified hat keine
 * Synth-Phase und sah sie deshalb nie, obwohl `sourceRegistry` das Datum in
 * jede Snippet-Zeile schreibt. Das Modell bekam die Daten und keine Anweisung
 * dazu.
 *
 * Die Regel gehört NICHT in `buildToolUsageBlock` kopiert: dieser Block ist im
 * split-Modus das Systemprompt der Sammelphase, `buildSynthSystem` das der
 * Schreibphase — eine Kopie stünde dort doppelt. Die Gatter auf beiden Seiten
 * schliessen sich deshalb aus (unified vs. split).
 */
export const RECENCY_RULE =
  'AKTUALITÄT: Hinter dem Titel steht, wo bekannt, das Veröffentlichungsdatum der Quelle. Widersprechen sich Quellen über einen JETZT-Zustand (Amt, Mandat, Mitgliedschaft, Preis, Stand eines Verfahrens), dann gilt die NEUESTE — nenne den Stand mit Datum ("seit September 2025 …"). Eine ältere Quelle im Präsens ("ist Bundesminister") beschreibt ihren Erscheinungszeitpunkt, nicht heute; übernimm sie nie als aktuellen Stand.';
