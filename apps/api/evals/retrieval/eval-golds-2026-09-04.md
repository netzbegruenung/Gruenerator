# Zwei Reparaturen am Messgerät (04.09.2026)

Beide Befunde fielen bei der Nachmessung des BM25-Standes auf. Keiner der
beiden ändert etwas an der Suche — sie ändern, was die Eval über die Suche
sagt.

## 1. Die Rerank-Zeile hat Misses als Treffer verbucht

`runRetrievalEval.ts` aggregierte den Rerank mit
`computeMetrics(outcomes, (o) => o.rerankRank ?? o.rank)`. `rerankRank` trägt
zwei verschiedene Zustände:

- `undefined` — es lief gar kein Rerank (Tor `results.length > 2`, oder der
  Cross-Encoder scheiterte),
- `null` — der Rerank lief und hat das Gold aus der Liste geschoben.

`null ?? o.rank` gab dem Miss seinen Rang **vor** dem Rerank zurück, und die
ungerankten Fälle zählten im Nenner mit. Die gedruckte Zeile war damit die
Frage „wie gut wäre es ohne Rerank gewesen?", nicht „was hat der Rerank
getan?". Betroffen war jeder `EVAL_RERANK=1`-Lauf in diesem Verzeichnis.

Gemessen am Stichwort-Set, derselbe Lauf, nur anders aggregiert:

```
alt:  GESAMT  n=20  Hit@1 65.0%  Hit@3 95.0%  Hit@5 100.0%  MRR@10 0.804
neu:  GESAMT  n=18  Hit@1 38.9%  Hit@3 72.2%  Hit@5  77.8%  MRR@10 0.551
                    2 Fälle ohne Rerank (≤2 Kandidaten oder Fehlschlag) — nicht eingerechnet
```

Vier der 18 gerankten Fälle verlieren ihr Gold ganz
(`kw-gruene-de-paragraf-218`, `kw-gruene-at-orf-beitrag`,
`kw-boell-bergkarabach`, `kw-bayern-anbindegebot`). Die Handrechnung in
`keyword-cases-2026-09-03.md` (n=17, 41,2 %, 0,564) kam auf dasselbe Bild;
jetzt rechnet es das Werkzeug.

**Wer eine ältere Rerank-Zahl aus diesem Verzeichnis zitiert, zitiert eine
Zahl, in der Rerank-Misses als Treffer gezählt sind.** Das betrifft die
Vergleichsarme in `tune-*-rerank.json` ebenso wie die Rerank-Spalten in
`hybrid-dense-join-2026-09-02.md`.

## 2. Fünf der 52 Fälle konnten nicht gewonnen werden

Geprüft wurde jedes Gold-Muster gegen die tatsächlichen `title`/`source_url`
der Sammlung (Scroll über alle Punkte, Landesverbände mit dem Default-Filter
aus `applyDefaultFilter`):

| Fall                         | Muster                          | Treffer im Index                                | Befund                                                                                                                                                                                           |
| ---------------------------- | ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `grundsatz-europa`           | `Europawahl\|Europa`            | 0 von 3 Dokumenten                              | Das Dokument heisst „EU-Wahlprogramm 2024 – Was uns schützt" und stand auf **Rang 1** — als Miss gebucht. Nur das Muster war falsch, die Anfrage bleibt.                                         |
| `kommunalwiki-bebauungsplan` | `Bebauungsplan\|Bauleitplan`    | 0 von 8.392 Punkten                             | Kein Artikel trägt den Begriff im Titel. Ersetzt durch `kommunalwiki-bodennutzung` (Gold: `Sozialgerechte Bodennutzung`, deckt dieselbe Ecke).                                                   |
| `gruenblog-netzpolitik`      | `Digital\|Netz` (Titel + URL)   | 0 von 605 Punkten                               | Die Titel des Magazins sind redaktionell („Der Ball ist bunt"), die Slugs spiegeln sie. Ersetzt durch `gruenblog-ki-strom`, Gold am Slug `energiefresser-ki`.                                    |
| `gruenblog-partei`           | `Strategie\|Partei\|Kurs`       | 13 — alle über `Kurs` in „Wachstums**kurs**"    | Ein Treffer wäre ein Zufall gewesen. Ersetzt durch `gruenblog-satzungsreform` (drei Artikel behandeln die Trennung von Amt und Mandat, alle drei zählen).                                        |
| `bayern-wahlprogramm`        | `Landtagswahl\|Wahlprogramm\|…` | 1 — „Van-der-Bellen-Berater … für Landtagswahl" | Der BY-Ausschnitt führt kein Landtagswahlprogramm; der einzige mögliche „Treffer" war eine Meldung über ÖSTERREICH. Ersetzt durch `bayern-100-tage` (Gold: „14 in 100 – das 100-Tage-Programm"). |

Warum das mehr ist als ein Schönheitsfehler: diese fünf Fälle sassen im
Nenner und konnten sich bei **keiner** Änderung bewegen. Jedes A/B der letzten
Wochen lief mit einem um rund 10 % abgestumpften Instrument, und Zeilen wie
`gruenblog-system Hit@1 0.0%` waren eine Aussage über das Label, nicht über
die Sammlung.

Alle fünf messen jetzt: Ränge 1, 1, 3, 3, 1 — zwei davon (`bayern-100-tage`,
`gruenblog-ki-strom`) mit Luft nach oben, tragen also Signal.

## Neue Basislinie: `baseline-2026-09-04.json`

qa-Pipeline, `EVAL_DEPTH=fast`, ohne Rerank, 72 Fälle (52 semantische + 20
`kw-`). Der Vergleich gegen den Lauf von gestern isoliert **nur** die
Label-Reparatur — an der Suche wurde nichts geändert:

```
                                vorher              nachher
GESAMT            n=72   Hit@1 62.5% MRR 0.737  →  Hit@1 66.7% MRR 0.788
grundsatz-system  n=16   Hit@1 56.3% MRR 0.681  →  Hit@1 62.5% MRR 0.792
kommunalwiki      n=14   Hit@1 64.3% MRR 0.744  →  Hit@1 71.4% MRR 0.815
bayern-system     n= 4   Hit@1 25.0% MRR 0.438  →  Hit@1 25.0% MRR 0.521
gruenblog-system  n= 2   Hit@1  0.0% MRR 0.000  →  Hit@1 50.0% MRR 0.667
```

**Diese Zahlen sind nicht besser geworden, sie waren vorher falsch.**

`compareOutcomes.ts` verweigert den Vergleich zweier Läufe mit verschiedenen
Fall-Mengen — vier ids haben sich geändert, ein Vergleich gegen
`baseline-2026-09-02.json` oder die `tune-*.json` braucht also den Schnitt der
gemeinsamen ids. Die alten Dateien bleiben unangetastet stehen.

## Nebenbefund für das nächste Scan-Skript

Der Schlüssel für die Dokumentidentität heisst je nach Sammlung
`document_id` (grundsatz), `article_id` (kommunalwiki, gruenblog) oder
`pageid`. Wer `document_id` annimmt, zählt still Chunks statt Dokumente.
