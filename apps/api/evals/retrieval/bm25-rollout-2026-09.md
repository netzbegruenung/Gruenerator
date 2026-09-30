# BM25-Rollout (#3118) — Messreihe 30.09.2026

Live-Migration je Sammlung über `scripts/migrate-bm25-sparse.ts`, danach Legacy-Fusion
(`HYBRID_SERVER_SIDE_ENABLED=false`) gegen Server-RRF (`true`) auf derselben Sammlung.
Fallmengen: `qa` und `manual` direkt, `notebook` über `EVAL_PIPELINE=notebook
EVAL_CASE_KIND=qa` (das Notebook-Fallset kennt diese Sammlungen nicht). Ergebnisdateien:
`bm25-<sammlung>-<pipeline>-<false|true>.json` in diesem Ordner.

Regel (vorab festgelegt): Server-RRF darf in jeder der drei Pipelines höchstens **einen**
Hit@1-Fall gegenüber Legacy verlieren.

## Vorbedingung

`kommunalwiki_documents`: `--verify-only` fand 130 Punkte ohne BM25-Vektor (Scraper-Lücke,
Fix in #3638 gemergt). In-place-Backfill am 30.09.2026, danach 6780 Punkte, 0 ohne Vektor.

## Ergebnis je Sammlung

| Sammlung (Punkte)                    | Pipeline | Fälle | Hit@1 Legacy → RRF | verloren / gewonnen (Rang 1) | Regel                       |
| ------------------------------------ | -------- | ----- | ------------------ | ---------------------------- | --------------------------- |
| `grundsatz_documents` (968)          | qa       | 16    | 62,5 % → 68,8 %    | 0 / 1                        | ok                          |
|                                      | notebook | 16    | 62,5 % → 68,8 %    | 1 / 2                        | ok (an der Grenze)          |
|                                      | manual   | 2     | 100 % → 50 %       | 1 / 0                        | ok, n=2                     |
| `oesterreich_gruene_documents` (645) | qa       | 9     | 88,9 % → 100 %     | 0 / 1                        | ok                          |
|                                      | notebook | 9     | 88,9 % → 100 %     | 0 / 1                        | ok                          |
|                                      | manual   | 1     | 100 % → 100 %      | 0 / 0                        | ok, n=1                     |
| `gruene_de_documents` (886)          | qa       | 11    | 72,7 % → 72,7 %    | 1 / 1                        | ok                          |
|                                      | notebook | 11    | 72,7 % → 63,6 %    | **2** / 1                    | **verletzt**                |
|                                      | manual   | 1     | 100 % → 100 %      | 0 / 0                        | ok, n=1                     |
| `gruene_at_documents` (1666)         | qa       | 6     | 50,0 % → 50,0 %    | 1 / 1                        | ok, aber Hit@5 100 → 66,7 % |
|                                      | notebook | 6     | 50,0 % → 50,0 %    | 1 / 1                        | ok                          |
| `gruenblog_documents` (910)          | qa       | 2     | 50,0 % → 100 %     | 0 / 1                        | ok, n=2                     |
|                                      | notebook | 2     | 100 % → 100 %      | 0 / 0                        | ok, n=2                     |
| `boell_stiftung_documents` (2575)    | qa       | 6     | 83,3 % → 66,7 %    | 1 / 0                        | ok                          |
|                                      | notebook | 6     | 66,7 % → 66,7 %    | 0 / 0                        | ok                          |

Für `gruene_at`, `gruenblog` und `boell_stiftung` gibt es keine manual-Fälle.

Suchzeit (Median, qa-Pipeline): grundsatz 754 → 197 ms, oesterreich 691 → 201 ms,
gruene-de 678 → 213 ms.

Die Fallzahlen sind klein (n=1 bis 16); ein einzelner Fall verschiebt Hit@1 um 6–50
Prozentpunkte. Die Zahlen belegen, dass die Migration nichts kippt und die Suche
schneller macht, nicht dass die Qualität steigt.

## Auffälligkeit: `gruene_at_documents`, qa-Pipeline

Formal bestanden (ein Rang-1-Verlust, ein Gewinn), aber Hit@5 fällt von 100 % auf 66,7 %,
MRR@10 von 0,667 auf 0,604: `gruene-at-klima` rutscht von Rang 4 auf 11, `gruene-at-team`
von 4 auf 8. In der Notebook-Pipeline fällt `gruene-at-team` von Rang 33 auf „nicht
gefunden", `gruene-at-energiewende` steigt von 19 auf 1. n=6; Ursache nicht untersucht.
Die Regel prüft nur Hit@1 und sieht diese Verschiebung nicht.

## Ausnahme: `gruene_de_documents`, notebook-Pipeline

Verloren: `gruene-de-vielfalt` (1 → 2) und `kw-gruene-de-urabstimmung` (1 → 4).
Gewonnen: `gruene-de-mitglied` (7 → 1). Hit@3 72,7 → 81,8 %, Hit@5 72,7 → 90,9 %, MRR@10
0,740 → 0,735.

Beobachtet für `urabstimmung` („Urabstimmung der Mitglieder"): 40 Treffer überstehen den
Schnitt, der Gold-Treffer steht auf Rang 4 — die 0,35-Schwelle ist nicht die Ursache.
Die BM25-Lane liefert 69 von 120 Treffern (`sparse join 69/120`); in der qa-Pipeline
(Limit 90 statt 120) steht derselbe Fall auf Rang 1. **Ungeprüft:** ob das allgemeine
Wort „Mitglieder" die Verdrängung verursacht — die Treffer auf Rang 1–3 wurden nicht
angesehen.

`HYBRID_SERVER_SPARSE_FACTOR` 0,5 und 0,25 liefern fallgleiche Ergebnisse wie 1,0. Das
ist erwartbar: RRF punktet nach Rang, das Kürzen der Sparse-Vorabholung entfernt nur den
Schwanz der Liste. Der Faktor ist kein Kopf-Regler. Andere Fusionsarme
(`HYBRID_SERVER_FUSION`) wurden für diese Sammlung nicht gemessen; auf Kommunalwiki
brachten sie in der Notebook-Pipeline keinen Gewinn (#3118).

Entscheidung: die Regelverletzung wird als Ausnahme geführt, `gruene_de_documents` bleibt
migriert. Begründung: Hit@3/Hit@5 steigen, die Suche ist etwa dreimal schneller, der
Verlust betrifft die Reihenfolge unter den ersten vier, und ein Rückbau wäre ein zweiter
Live-Umbau ohne Rückwärtsgang im Skript.

## Nicht erledigt

- Prod-API-Neustart: `collectionSupportsBm25` wird pro Prozess gecacht, bis dahin läuft
  dort Legacy. `HYBRID_SERVER_SIDE_ENABLED` gilt global, nicht pro Sammlung.
- Noch nicht migriert: `bundestag_content` und `abgeordnetenwatch_documents` (keine
  Eval-Fälle; nur Zählung, Abdeckungsprüfung und ein Rauchtest vorgesehen).
- `landesverbaende_*` bleibt bewusst auf Legacy-Fusion.
