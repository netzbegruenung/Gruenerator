# CSV-Testdateien für Chat-Tests

Synthetische Daten, keine echten Zahlen. Gedacht für Live-Tests im Dev-Bypass
(Datei in den Chat ziehen) und für Eval-Szenarien. Die Sollwerte stehen in
`expected.json` — gerechnet aus denselben Daten, nicht geschätzt.

| Datei                 | Größe                  | Format                                        | Prüft                                                                                                           |
| --------------------- | ---------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `radwege-kreis-s.csv` | 10 Zeilen              | `;` und Dezimalkomma (deutscher Excel-Export) | Rechnen pro Kopf; Platz 1 und 2 liegen 0,15 € auseinander, Schätzen fällt auf                                   |
| `haushalt-s.csv`      | 7 Zeilen               | `,`                                           | Summen, Prozent, negative Veränderungen                                                                         |
| `mitglieder-m.csv`    | 240 Zeilen             | `;`                                           | Gruppieren nach Kreisverband und Monat                                                                          |
| `radzaehlung-l.csv`   | 5.110 Zeilen, ~200 KB  | `,`                                           | Mehr Zeilen, als in einen Prompt-Auszug passen: wird gerechnet oder aus einem Ausschnitt geraten?               |
| `antraege-fallen.csv` | 5 Zeilen + Summenzeile | `;`, UTF-8 mit BOM                            | Anführungszeichen mit `,`/`;`/`""`, leere Zelle, Tausenderpunkte, Summenzeile, die nicht mitgezählt werden darf |

Die Dateien sind deterministisch erzeugt (fester Seed). Wer eine ändert,
muss `expected.json` mitziehen.
