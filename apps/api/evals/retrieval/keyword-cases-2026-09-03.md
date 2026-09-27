# Stichwort-Fälle (`kw-`) — gefundene Gold-Dokumente und Basislauf

Zwanzig neue `qa`-Fälle in `cases.ts`, Präfix `kw-`, isolierbar über
`EVAL_FILTER=kw-`. Sie schliessen die Lücke aus #3118: die 52 Fälle davor sind
semantische Fragen, die die dichte Einbettung ohnehin beantwortet — der
Sparse-Arm (BM25) wird darin gar nicht sichtbar. Jede Anfrage hier trägt
mindestens ein Token, das eine Person wirklich tippt: einen Fachbegriff, eine
Paragrafen- oder Artikelnummer, einen Eigennamen, eine Abkürzung, eine Zahl.

## Wie das Gold gefunden wurde

Ein Wegwerf-Skript (`kw-scan.ts`, ausserhalb des Repos) hat jede Sammlung
einmal mit `scroll` (Payload `title`, `source_url`, `chunk_text`, `limit: 256`,
`with_vector: false`) ausgelesen — `landesverbaende_documents` mit dem
Default-Filter aus `applyDefaultFilter` (`landesverband ∈ {BY, BY-F}` bzw.
`{BE, BE-F}`), sonst wären es 25 618 statt 3 617 / 6 288 Punkte. Danach wurde
je Begriff gezählt, wie viele **Dokumente** (`document_id`, nicht Chunks) ihn im
Text tragen. Aufgenommen wurde ein Begriff nur bei 1–3 Dokumenten, und nur
wenn das Dokument die Anfrage auch beantwortet. Die Muster sind gegen die
echten `title`-Werte geprüft: jedes trifft in seiner Sammlung genau ein
Dokument (`^Kommunale Selbstverwaltung$` ist verankert, weil es einen Artikel
„Kommunale Selbstverwaltung sieht anders aus" gibt).

Sammlungsgrössen zum Messzeitpunkt (03.09.2026), Punkte / Dokumente:
grundsatz 968 / 3, kommunalwiki 8 392 / 1 707, gruene-de 865 / 256,
oesterreich-gruene 645 / 3, gruene-at 1 006 / 155, boell 2 267 / 330,
bayern 3 617 / 1 100, berlin 6 288 / 1 468.

## Die zwanzig Fälle

Spalte „Dok." = Dokumente in der Sammlung, die den Begriff im Text tragen
(Chunks in Klammern). „Rang" = Rang des Gold-Dokuments im heutigen Index
(Hybrid, `EVAL_DEPTH=fast`, ohne Rerank).

| id                                   | Sammlung                  | Anfrage                                     | Begriff             | Gold-Titel                                                                                 | Dok.                     | Rang |
| ------------------------------------ | ------------------------- | ------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------ | ------------------------ | ---- |
| kw-grundsatz-paragraf-218            | grundsatz-system          | `§ 218 StGB Schwangerschaftsabbruch`        | § 218               | Regierungsprogramm 2025 – Zusammen wachsen                                                 | 1 (1)                    | 2    |
| kw-grundsatz-tariftreuegesetz        | grundsatz-system          | `Tariftreuegesetz öffentliche Aufträge`     | Tariftreuegesetz    | Regierungsprogramm 2025 – Zusammen wachsen                                                 | 1 (1)                    | 1    |
| kw-grundsatz-anthropozaen            | grundsatz-system          | `Anthropozän`                               | Anthropozän         | Grundsatzprogramm 2020 – Veränderung schafft Halt                                          | 1 (1)                    | 1    |
| kw-grundsatz-bologna-prozess         | grundsatz-system          | `Bologna-Prozess Studienabschlüsse`         | Bologna-Prozess     | EU-Wahlprogramm 2024 – Was uns schützt                                                     | 1 (2)                    | 1    |
| kw-kommunalwiki-art-28-gg            | kommunalwiki-system       | `Art. 28 GG Allzuständigkeit`               | Art. 28 GG          | Kommunale Selbstverwaltung                                                                 | 1 (1)                    | 2    |
| kw-kommunalwiki-waermeplanungsgesetz | kommunalwiki-system       | `Wärmeplanungsgesetz`                       | Wärmeplanungsgesetz | Klimaschutz als kommunale Pflichtaufgabe?                                                  | 1 (4)                    | 1    |
| kw-kommunalwiki-erhaltungssatzung    | kommunalwiki-system       | `Erhaltungssatzung Milieuschutzsatzung`     | Erhaltungssatzung   | Vorkaufsrecht der Gemeinde                                                                 | 1 (6)                    | 1    |
| kw-kommunalwiki-pfas                 | kommunalwiki-system       | `PFAS Grenzwerte Trinkwasser`               | PFAS                | Per- und polyfluorierte Alkylverbindungen (PFAS)                                           | 2 (26, davon 24 im Gold) | 1    |
| kw-gruene-de-paragraf-218            | gruene-de-system          | `§ 218 StGB Beratungsbescheinigung`         | § 218               | Neuregelung von Schwangerschaftsabbrüchen                                                  | 1 (1)                    | 1    |
| kw-gruene-de-urabstimmung            | gruene-de-system          | `Urabstimmung der Mitglieder`               | Urabstimmung        | Koalitionsvertrag: Mehr Fortschritt wagen                                                  | 1 (3)                    | 1    |
| kw-gruene-de-lieferkettengesetz      | gruene-de-system          | `Lieferkettengesetz Lieferkettenrichtlinie` | Lieferkettengesetz  | Schulterschluss mit Rechtsextremen: Konservative schwächen Umweltschutz und Menschenrechte | 1 (2)                    | 1    |
| kw-at-klimabonus                     | oesterreich-gruene-system | `Klimabonus und CO2-Preis`                  | Klimabonus          | Wahlprogramm Nationalratswahl 2024 der Grünen (Österreich)                                 | 1 (4)                    | 1    |
| kw-at-zwentendorf                    | oesterreich-gruene-system | `Zwentendorf Hainburger Au`                 | Zwentendorf         | Grundsatzprogramm der Grünen (Österreich)                                                  | 1 (1)                    | 2    |
| kw-at-fit-for-55                     | oesterreich-gruene-system | `Fit for 55 Emissionshandel`                | Fit for 55          | EU-Wahlprogramm 2024 der Grünen (Österreich)                                               | 1 (2)                    | 1    |
| kw-gruene-at-orf-beitrag             | gruene-at-system          | `ORF-Beitrag`                               | ORF-Beitrag         | Ein fairer Beitrag für einen starken ORF - Die Grünen                                      | 1 (7)                    | 1    |
| kw-gruene-at-maklerprovision         | gruene-at-system          | `Maklerprovision Miete wer zahlt`           | Maklerprovision     | Maklerinnenprovision - Die Grünen                                                          | 1 (2)                    | 1    |
| kw-boell-carbon-bubble               | boell-stiftung-system     | `Carbon Bubble`                             | Carbon Bubble       | Die "Carbon Bubble": Finanzwirtschaft am Kipppunkt?                                        | 1 (6)                    | 1    |
| kw-boell-bergkarabach                | boell-stiftung-system     | `Bergkarabach-Krieg 2020`                   | Bergkarabach        | Armenien vor der Wahl: Welche Art von Demokratie wird sich durchsetzen?                    | 1 (5)                    | 1    |
| kw-bayern-anbindegebot               | bayern-system             | `Anbindegebot Lockerung`                    | Anbindegebot        | „Flächenfraß steigt auf 11,6 Hektar täglich an – brauchen Pflichtwert statt Richtwert"     | 1 (2)                    | 1    |
| kw-berlin-rummelsburger-bucht        | berlin-system             | `Rummelsburger Bucht Kulturhafen`           | Rummelsburger Bucht | 20210813_Grüne Antworten_WPS_Bürgerforum Stralau                                           | 1 (2)                    | 1    |

In neun der zwanzig Fälle trägt der Gold-Titel den Suchbegriff **nicht**
(Wärmeplanungsgesetz, Erhaltungssatzung, Art. 28 GG, § 218 ×2, Urabstimmung,
Lieferkettengesetz, Bergkarabach, Anbindegebot, Rummelsburger Bucht) — dort ist
der Fall wirklich ein Sparse-Test und keine verkappte Titelübereinstimmung.

## Basislauf 1 — `EVAL_FILTER=kw- pnpm eval:retrieval` (qa, fast, ohne Rerank)

```
── Ergebnisse (Retrieval) ──
grundsatz-system             n= 4  Hit@1  75.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 0.875
kommunalwiki-system          n= 4  Hit@1  75.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 0.875
gruene-de-system             n= 3  Hit@1 100.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 1.000
oesterreich-gruene-system    n= 3  Hit@1  66.7%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 0.833
gruene-at-system             n= 2  Hit@1 100.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 1.000
boell-stiftung-system        n= 2  Hit@1 100.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 1.000
bayern-system                n= 1  Hit@1 100.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 1.000
berlin-system                n= 1  Hit@1 100.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 1.000
GESAMT                       n=20  Hit@1  85.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 0.925

── Wanduhr je Suche ──
n=20  Median 620 ms  p90 944 ms  max 1926 ms
```

**Kein einziger Miss.** Das war nicht die Erwartung, und es ist selbst ein
Befund: der Produktionspfad ist bereits hybrid — `hybridSearch` fährt eine
Textsuche neben der Vektorsuche und hebt bei Treffern das Textgewicht dynamisch
an (im Log z. B. `Dynamic weights applied: vectorWeight=0.5, textWeight=0.5` für
`Rummelsburger Bucht Kulturhafen`, `vectorWeight=0.85, textWeight=0.15` für
`Anbindegebot Lockerung`). Was diese zwanzig Fälle deshalb messen, ist nicht
„findet die dichte Einbettung den Begriff?", sondern „bleibt der wörtliche
Treffer oben, wenn man an Gewichten, Schwellen oder am Rerank dreht?". Genau
dafür sind sie als Regressionsnetz gedacht — die Aussage des heutigen Laufs ist
die Basislinie, gegen die eine Sparse-Änderung gemessen wird.

Drei Fälle stehen auf Rang 2 statt 1 (`kw-grundsatz-paragraf-218`,
`kw-kommunalwiki-art-28-gg`, `kw-at-zwentendorf`) — alle drei sind
Paragrafen-/Eigennamen-Fälle mit genau **einem** tragenden Chunk. Das ist die
dünnste Stelle des Sets und der erste Ort, an dem eine Sparse-Verschlechterung
sichtbar würde.

## Basislauf 2 — `EVAL_FILTER=kw- EVAL_RERANK=1 pnpm eval:retrieval`

```
── Ergebnisse (Retrieval) ──
grundsatz-system             n= 4  Hit@1  75.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 0.875
kommunalwiki-system          n= 4  Hit@1  75.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 0.875
gruene-de-system             n= 3  Hit@1 100.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 1.000
oesterreich-gruene-system    n= 3  Hit@1  66.7%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 0.833
gruene-at-system             n= 2  Hit@1 100.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 1.000
boell-stiftung-system        n= 2  Hit@1 100.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 1.000
bayern-system                n= 1  Hit@1 100.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 1.000
berlin-system                n= 1  Hit@1 100.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 1.000
GESAMT                       n=20  Hit@1  85.0%  Hit@3 100.0%  Hit@5 100.0%  MRR@10 0.925

── Wanduhr je Suche ──
n=20  Median 529 ms  p90 765 ms  max 1064 ms

── Ergebnisse (nach Rerank) ──
GESAMT                       n=20  Hit@1  65.0%  Hit@3  95.0%  Hit@5 100.0%  MRR@10 0.804

── Latenz des Cross-Encoder-Aufrufs ──
n=18  Median 2564 ms  p90 3707 ms  max 4007 ms  (Kandidaten je Aufruf: 3–30)
```

### Der Rerank schadet auf Stichwortanfragen

Rang je Fall aus demselben Lauf (`rank` = Hybrid, `rerank` = nach dem
Cross-Encoder):

```
kw-grundsatz-paragraf-218              rank 2 → rerank 3
kw-grundsatz-tariftreuegesetz          rank 1 → rerank 1
kw-grundsatz-anthropozaen              rank 1 → rerank 2
kw-grundsatz-bologna-prozess           rank 1 → rerank 1
kw-kommunalwiki-art-28-gg              rank 2   (kein Rerank: ≤2 Kandidaten)
kw-kommunalwiki-waermeplanungsgesetz   rank 1   (kein Rerank: ≤2 Kandidaten)
kw-kommunalwiki-erhaltungssatzung      rank 1   (kein Rerank: ≤2 Kandidaten)
kw-kommunalwiki-pfas                   rank 1 → rerank 1
kw-gruene-de-paragraf-218              rank 1 → rerank miss
kw-gruene-de-urabstimmung              rank 1 → rerank 1
kw-gruene-de-lieferkettengesetz        rank 1 → rerank 1
kw-at-klimabonus                       rank 1 → rerank 2
kw-at-zwentendorf                      rank 2 → rerank 2
kw-at-fit-for-55                       rank 1 → rerank 2
kw-gruene-at-orf-beitrag               rank 1 → rerank miss
kw-gruene-at-maklerprovision           rank 1 → rerank 1
kw-boell-carbon-bubble                 rank 1 → rerank 1
kw-boell-bergkarabach                  rank 1 → rerank miss
kw-bayern-anbindegebot                 rank 1 → rerank miss
kw-berlin-rummelsburger-bucht          rank 1 → rerank 4
```

Der Cross-Encoder verliert vier Gold-Dokumente ganz und schiebt fünf weitere
nach unten; er verbessert **keinen** Fall. Das ist der teure Teil des Befunds:
er kostet dabei im Median 2,6 s je Anfrage.

### Die gedruckte Rerank-Zeile ist zu freundlich

`Hit@5 100.0%` in der Rerank-Tabelle ist kein Messwert, sondern eine Lücke im
Runner. `runRetrievalEval.ts:801` aggregiert mit
`computeMetrics(outcomes, (o) => o.rerankRank ?? o.rank)`. `rerankRank` ist
`null`, wenn das Gold nach dem Rerank **nicht mehr** in der Liste steht — und
`null ?? o.rank` fällt auf den Rang VOR dem Rerank zurück. Ein Rerank-Miss
wird also mit seinem Hybrid-Rang gutgeschrieben. Dieselbe Zeile verbucht
ausserdem die drei Fälle mit, für die wegen `results.length > 2`
(`runRetrievalEval.ts:313`) gar kein Rerank lief.

Ehrlich gerechnet, nur über die 17 tatsächlich gerankten Fälle und mit Miss
als Miss:

```
nach Rerank (korrigiert)     n=17  Hit@1  41.2%  Hit@3  70.6%  Hit@5  76.5%  MRR@10 0.564
```

Gegen dieselben 17 Fälle vor dem Rerank (Hit@1 88,2 %, MRR 0,941) heisst
das: der Rerank halbiert Hit@1 auf Stichwortanfragen. Auf dem semantischen Set
tut er das nicht — das ist genau der Unterschied, den dieses Set sichtbar
machen sollte.

Beides — der `?? o.rank`-Rückfall und das stille Überspringen bei ≤2
Kandidaten — betrifft **alle** bisherigen `EVAL_RERANK=1`-Läufe, nicht nur
diesen. Wer eine ältere Rerank-Zahl aus diesem Verzeichnis zitiert, zitiert
eine Zahl, in der Rerank-Misses als Treffer gezählt sind.
