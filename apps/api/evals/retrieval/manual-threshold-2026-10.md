# Schnitt der manuellen Suche — Messreihe 05.10.2026

Alle Läufe gingen gegen die Live-Instanz und waren rein lesend. Der Pfad ist `/api/research/search` → `DocumentSearchService.search` (Server-RRF, `dense ≥ 0,35`-Prefetch, BM25) → `rankManualSearchResults`.

Auslöser war die Rückmeldung, dass „hitze“ in einem LV-Notebook nichts zu Hitzeschutz findet.

## Befund

`similarity_score` ist ein RRF-Rangwert plus Boni, kein Kosinus. Ein Dokument, das nur die dichte Lane findet, liegt bei ≈ 1/(Rang+2) und fällt ab Rang drei unter 0,35.

„Hitzeschutz“-Artikel bekommen bei der Anfrage „hitze“ nie die BM25-Lane:

- `bm25Terms` und CISTEM bilden „hitze“ auf `hitz` ab, aber „Hitzeschutz“ auf `hitzeschutz`.
- Ihr Score liegt deshalb bei 0,33, obwohl sie „hitze“ wörtlich enthalten.

Beispiel `inspectManualStages.ts hitze berlin-system`:

```
 6. 0.339  cos 0.741  term  2  Senat verschläft Hitzeschutz  ← Titel
 7. 0.327  cos 0.717  term  1  Hitzeschutz: Berlin braucht mehr Bäume statt mehr Beton  ← Titel
```

## Drei Schnitte, 48 Fälle

Gemessen wurden 36 Fälle über BE, BY, HE, TH, SL und `gruene-at-system` (HH, SN und SH haben 0 Punkte, siehe #3831), dazu 12 Mehrwort-Fälle. Die Kategorien:

- Kompositum-Präfix, Kompositum-Kopf, ganzes Kompositum
- Synonym, Flexion, Umlaut
- Mehrwort, Akronym
- 14 Negativkontrollen (Thema kommt im LV nicht vor)

„Titel“ zählt die Dokumente, deren Titel den Wortstamm trägt.

| Schnitt                                 | 8 Mehrwort-Negativkontrollen (Ø Dok.) | 6 Einwort-Negativkontrollen | `hitze` Titel | `wald`  | `rad`     | `schutz` | `Baum`    | `Söder`   |
| --------------------------------------- | ------------------------------------- | --------------------------- | ------------- | ------- | --------- | -------- | --------- | --------- |
| heute: `score ≥ 0,35`                   | 3                                     | 0                           | 3/11          | 3/9     | 4/11      | 1/8      | 2/15      | 7/24      |
| `(dense ?? score) ≥ 0,35` (wie #3166)   | **23**                                | 0                           | 11/11         | 9/9     | 11/11     | 6/8      | 14/15     | 23/24     |
| **`score ≥ 0,35` oder Begriff im Text** | **3**                                 | 0                           | **11/11**     | **9/9** | **11/11** | **8/8**  | **14/15** | **24/24** |

**Warum der Kosinus nicht trennt.** Seine Höhe folgt der Länge der Anfrage, nicht dem Thema. On-Topic-Titeltreffer kurzer Anfragen beginnen bei 0,64, Off-Topic-Treffer langer Anfragen reichen bis 0,81. On-Topic und Rest überlappen ganz:

| Gruppe             | p10   | Median | p90   |
| ------------------ | ----- | ------ | ----- |
| Einwort On-Topic   | 0,674 | 0,740  | 0,819 |
| Mehrwort Off-Topic | 0,708 | 0,767  | 0,793 |

Ein Kosinus-Schnitt, der „hitze“ rettet, lässt also die Negativkontrollen durch.

**Warum Einwort-Negativkontrollen schon heute bei 0 stehen.** Das macht der Kurzanfragen-Filter in `groupAndRankHybridResults`: Er entfernt jedes Dokument, das den Begriff nicht enthält und unter `maxSimilarity < 0,55` bleibt. Bei „Almwirtschaft“ in Berlin waren das alle 90 dichten Treffer. Der wörtliche Treffer ist damit der Trenner, den die Pipeline für kurze Anfragen ohnehin schon benutzt.

## Eval vorher/nachher

- `EVAL_PIPELINE=manual` (13 Fälle, neu `manual-berlin-hitze`): keine Verschlechterung.
  - `manual-kommunalwiki-klimaanpassung`: miss → Rang 2
  - `manual-berlin-hitze`: Rang 6 (vorher fiel das Gold-Dokument unter den Schnitt)
  - GESAMT Hit@3: 91,7 % → 92,3 %, MRR@10: 0,875 → 0,859; der Durchschnitt fällt nur, weil der neue Fall auf Rang 6 steht. Ohne ihn 0,917 (vorher 0,875).
- `EVAL_PIPELINE=manual EVAL_CASE_KIND=qa` (72 Fälle): Fall für Fall identisch. Hit@1 72,2 %, MRR@10 0,825.

Das ist bauartbedingt so: Die Regel fügt nur Dokumente **unter** 0,35 hinzu, sortiert wird weiter nach Score. Ein vorher ausgeliefertes Dokument kann also keinen Rang verlieren.

## Volltext-Modus

Der Volltext-Pfad hat die Anfrage nie an `groupAndRankHybridResults` weitergegeben (`searchOperations.performTextSearch`). Damit war `normQuery` leer. Die Folgen:

- kein Begriffs-Bonus
- kein Titel-Gleichstandsentscheider
- `term_chunk_count = 0`, obwohl jeder Treffer per `match: {text}` ein wörtlicher ist
- die Karte zeigte „N Textabschnitte“ statt „mind. N Erwähnungen“

Mit der durchgereichten Anfrage und der neuen Regel (Berlin):

| Anfrage       | gefunden | heute ausgeliefert | neu |
| ------------- | -------- | ------------------ | --- |
| `hitze`       | 30       | 6                  | 30  |
| `Hitzeschutz` | 22       | 2                  | 22  |

Der `word`-Tokenizer auf `chunk_text` findet bei „hitze“ weiterhin nur das freistehende Wort, nicht „Hitzeschutz“.

## Was offen bleibt

- **Mehrwort-Anfragen** („Hitzeschutz in Berliner Schulen“: 1 von 8 Titeln) gewinnen nichts, denn der wörtliche Treffer prüft die ganze Anfrage als Teilzeichenkette.
- **Kurze Teilzeichenketten matchen auch Fremdwörter** („rad“ steckt in „gerade“). Solche Dokumente stehen unten, weil die Sortierung beim Score bleibt.
- **BM25 zerlegt keine Komposita.** Das ist ein eigener Schritt (Dokumentseite plus Re-Encode). Die Rangfolge der Kompositum-Treffer würde besser, ihre Sichtbarkeit hängt seit diesem Schnitt nicht mehr daran.
