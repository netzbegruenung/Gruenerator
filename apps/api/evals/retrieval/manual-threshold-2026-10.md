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

- **Mehrwort-Anfragen** sind im Abschnitt „Mehrwort-Abdeckung“ nachgezogen.
- **Kurze Teilzeichenketten matchen auch Fremdwörter** („rad“ steckt in „gerade“). Solche Dokumente stehen unten, weil die Sortierung beim Score bleibt.
- **BM25 zerlegt keine Komposita.** Ob sich das lohnt, misst der nächste Abschnitt. Die Antwort ist vorerst nein.

## Kompositum-Erweiterung im BM25 — gemessen, nicht gebaut

Frage: Würde es die Rangfolge verbessern, Komposita in die Sparse-Lane zu holen? Das hieße eine Wortliste aus dem Korpus, Zerlegung auf der Dokumentseite und ein Re-Encode.

**Billige Vorab-Messung ohne Schreibzugriff:**

- Vokabular aller BM25-Stämme aus den 26 562 Chunks von `landesverbaende_documents`.
- Die Anfrage bekommt die bis zu 40 häufigsten Stämme dazu, die mit dem Anfragestamm beginnen (bzw. auch enden), z. B. `hitz` → `hitzeschutz`, `hitzewell`, `hitzeaktionspla` …
- Das geht als `sparseQueryVector` in die Suche, danach läuft `rankManualSearchResults` mit dem neuen Schnitt.

Grundlage sind 14 Positivfälle (davon 10 Kompositum-Präfixe) und 2 Mehrwort-Negativkontrollen. Ausgewertet werden die Ränge der Titeltreffer:

| Arm                        | Titel in Top 10 | Σ MRR     | Σ AP     |
| -------------------------- | --------------- | --------- | -------- |
| ohne Erweiterung           | 80              | **11,50** | **8,76** |
| Präfix, Gewicht 0,5        | 79              | 9,00      | 8,49     |
| Präfix, Gewicht 0,3        | 80              | 9,03      | 8,49     |
| Präfix + Kopf, Gewicht 0,3 | 79              | 8,92      | 8,51     |

**Ergebnis:**

- Klar besser wird nur `rad`: 11 → 19 Titel, AP 0,60 → 0,84.
- Schlechter werden `hitze` (erster Titeltreffer Rang 1 → 3), `energie` und `schule`. Die Erweiterung hebt Dokumente, die viele verschiedene Komposita enthalten, also Wahlprogramme und Sammelbeschlüsse, über die Artikel, die das Thema im Titel tragen.
- Ganze Wörter (`Hitzeschutz`, `BVG`, `Söder`) und Negativkontrollen bleiben praktisch gleich.

Die Messung bildet die Dokumentseite nur näherungsweise ab. Sie spricht trotzdem gegen den Umbau, solange keine Gewichtung gefunden ist, die Sammeldokumente nicht bevorzugt.

**Falle beim Nachmessen:**

- `generateCacheKey` kannte `sparseQueryVector` nicht. Drei der vier Arme kamen deshalb unbemerkt aus dem Cache und lieferten exakt die Zahlen des ersten.
- Seit diesem PR steht der Vektor im Schlüssel.

## Mehrwort-Abdeckung

**Wie eine Mehrwort-Anfrage vorher lief:** `containsNormalized` verlangte jedes Wort ab 3 Buchstaben, Füllwörter eingeschlossen, im **selben** Chunk. Satzzeichen blieben am Wort hängen („stadt?“), es rettete nur die Tippfehler-Toleranz. Kurzanfragen-Filter und Titel-Gleichstand gelten erst bis 2 Wörter. Bei „Hitzeschutz in Berliner Schulen“ blieb 1 von 8 Hitzeschutz-Titeln.

Zahlen: Dokumente / davon Titeltreffer. 12 Positivfälle, 10 Negativkontrollen, sechs LVs. Simuliert auf Titel plus `top_chunks`.

| Regel für Dokumente unter 0,35                                   | Positiv      | Negativ |
| ---------------------------------------------------------------- | ------------ | ------- |
| vorher                                                           | 118 / 45     | 29      |
| alle Inhaltswörter irgendwo im Dokument                          | 135 / 49     | 29      |
| mindestens die Hälfte                                            | 303 / 94     | 63      |
| alle bis auf eines                                               | 221 / 84     | 47      |
| unterscheidende Wörter aus den **Kandidaten** (≤ 50 % Vorkommen) | 91 / 34      | 29      |
| **alle bis auf eines, das im Korpus seltenste ist Pflicht**      | **188 / 76** | **29**  |

**Warum diese Regel:**

- „Alle bis auf eines“ rauscht über Allerweltswörter. „Schulen in Berlin am Strand bauen“ wird von schulen + berlin + bauen getragen.
- Seltenheit aus den Kandidaten ist zirkulär: Unter den Treffern sind gerade die Themenwörter häufig, weil die Suche sie gefunden hat.
- Die Korpus-Häufigkeit stammt aus `count` auf `chunk_text` im LV-Ausschnitt. Beispiele aus Berlin: „berliner“ 3 251, „hitzeschutz“ 36, „strand“ 0.

**Durch den Produktionscode nachgemessen** (`withQueryCoverage` → `rankManualSearchResults`, alle Chunks), dazu 8 schwierigere Negativkontrollen, deren seltenes Wort im Korpus vorkommt („Wolf im Tiergarten auswildern“: wolf 4; „Windkraft auf hoher See“: windkraft 15):

|        | Positiv  | Negativ (18) |
| ------ | -------- | ------------ |
| vorher | 118 / 45 | 59           |
| neu    | 189 / 76 | 59           |

Die Häufigkeiten kosten warm im Median 101 ms für die Wörter einer Anfrage. Sie laufen parallel zur Suche und sind je LV-Ausschnitt und Wort eine Stunde gecacht. Nach 1,5 s entfällt die Regel.

**Eval:**

- `EVAL_PIPELINE=manual`: die 13 bisherigen Fälle unverändert. Neu dazu `manual-berlin-hitzeschutz-schulen` (Rang 4) und `manual-hessen-radwege` (Rang 6); deren Gold fiel vorher unter den Schnitt.
- `EVAL_CASE_KIND=qa` (72): `gruene-at-team` miss → Rang 4, sonst identisch. Hit@5 95,8 % → 97,2 %, MRR@10 0,825 → 0,828.

**Schwach bleibt:**

- Ist das seltenste Wort ein Verb, wird es Pflicht. Bei „mehr Bäume in Berlin pflanzen“ (pflanzen 46 gegen bäume 130) kommen 6 statt der möglichen 13 Titel.
- Eine Negativkontrolle, deren seltenes Wort im Korpus vorkommt und in einem fremden Zusammenhang steht, bleibt denkbar. Unter den 8 gemessenen trat keine auf.
