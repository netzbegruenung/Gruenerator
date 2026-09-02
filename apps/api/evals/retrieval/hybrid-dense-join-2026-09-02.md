# Score-Join auf dem server-seitigen Hybrid-Pfad — Messreihe 02.09.2026

Alle Läufe in einer Sitzung gegen die Live-Instanz, `HYBRID_ENABLE_QUALITY_GATE`
in jedem Befehl explizit gesetzt, kein Schreibzugriff. Sammlung: kommunalwiki
(10 qa-Fälle); die 42 Nicht-kommunalwiki-Fälle sind die Kontrollgruppe.
Diese Datei erhebt Zahlen und wendet keine Regel an — die Entscheidung steht
im PR.

Probe (`scripts/probe-qdrant-query-shapes.ts`, aus Task 1, vor dieser Reihe
gefahren — nicht erneut ausgeführt, Referenz aus `task-1-report.md`):

- `queryBatch` mit drei Suchen: akzeptiert, 3 Antworten, Punkte 4/4/4, 76 ms
- dieselbe rrf-Abfrage einzeln: 106 ms

| Arm                                                | kw qa Hit@1 / MRR@10 | kw notebook Hit@1 / MRR@10 | notebook +Rerank Hit@1 / MRR@10 | manual (3 Fälle) | dense-Join-Deckung | sparse-Join-Deckung | 42 Kontrollfälle identisch? | Median searchTimeMs |
| -------------------------------------------------- | -------------------- | -------------------------- | ------------------------------- | ---------------- | ------------------ | ------------------- | --------------------------- | ------------------- |
| Join aus, `rrf` (Reproduktion von `tune-rrf.json`) | 50 % / 0,642         | nicht gelaufen             | nicht gelaufen                  | nicht gelaufen   | —                  | —                   | ja                          | 406 ms              |
| Join an, `rrf`                                     | 60 % / 0,692         | 50 % / 0,567               | 50 % / 0,567                    | 2/3 Rang 1       | 64,1 % (577/900)   | 56,6 % (509/900)    | ja                          | 391 ms              |
| Join an, `dbsf`                                    | 80 % / 0,813         | 30 % / 0,350               | 30 % / 0,350                    | 3/3 Rang 1       | 62,9 % (566/900)   | 57,8 % (520/900)    | ja                          | 423 ms              |
| Join an, `rrf` + Gatter an                         | 60 % / 0,692         | nicht gelaufen             | nicht gelaufen                  | nicht gelaufen   | 64,4 % (580/900)   | 56,2 % (506/900)    | ja                          | 383 ms              |
| _Referenz #3169:_ Join aus, `rrf`                  | 50 % / 0,642         | 50 % / 0,567               | nicht gelaufen                  | 2/3 Rang 1       | —                  | —                   | ja                          | 383 ms              |
| _Referenz #3169:_ Join aus, `dbsf`                 | 80 % / 0,813         | 30 % / 0,361               | nicht gelaufen                  | 3/3 Rang 1       | —                  | —                   | ja                          | 498 ms              |

Gewinner der Steps 2–4 (roh, MRR@10 qa + notebook zusammengenommen): `rrf`
(0,692 + 0,567 = 1,259) vor `dbsf` (0,813 + 0,350 = 1,163) — daher trägt der
Gatter-Zusatzlauf (Step 5) den Arm `rrf`. `<gewinner>` = `rrf`, Dateiname
`tune-join-rrf-gate.json`.

## Fallweise Verschiebungen

`eval:retrieval:compare` je Paar, nur die `↓`/`↑`-Zeilen:

- `tune-rrf.json` → `tune-join-rrf.json` (qa): `↑ kommunalwiki-laerm: rank 2 → rank 1`
- `tune-rrf-notebook.json` → `tune-join-rrf-notebook.json`: `↑ kommunalwiki-jugend: miss → rank 18`
- `tune-dbsf.json` → `tune-join-dbsf.json` (qa): keine
- `tune-dbsf-notebook.json` → `tune-join-dbsf-notebook.json`: `↓ kommunalwiki-laerm: rank 9 → rank 14`
- `tune-join-rrf.json` → `tune-join-dbsf.json` (qa, Arm gegen Arm mit Join): `↑ kommunalwiki-fraktion: rank 4 → rank 1`, `↑ kommunalwiki-vergabe: rank 2 → rank 1`, `↓ kommunalwiki-jugend: rank 6 → rank 8`

`tune-join-rrf.json` → `tune-join-rrf-gate.json` (Gatter-Zusatzlauf, zur
Vollständigkeit, nicht in Step 7 verlangt): keine Verschiebung, Metriken
identisch (53,8 % / 0,665 GESAMT, kommunalwiki-system unverändert 60 % /
0,692).

## Deckungsgrad im Detail

Aus den Logzeilen `dense join d/m, sparse join s/m` über alle Anfragen des
jeweiligen Laufs. `dense join`/`sparse join` erscheinen nur für Anfragen gegen
die kommunalwiki-Sammlung (die einzige mit Sparse-Vektor unter den 52
qa-Fällen) — daher 10 von 52 Anfragen je Lauf, nicht 52.

| Arm            | Anfragen | dense join Σd/Σm | schlechteste Einzelanfrage | sparse join Σs/Σm |
| -------------- | -------- | ---------------- | -------------------------- | ----------------- |
| `rrf`          | 10       | 577/900 (64,1 %) | 47/90 (52,2 %)             | 509/900 (56,6 %)  |
| `dbsf`         | 10       | 566/900 (62,9 %) | 44/90 (48,9 %)             | 520/900 (57,8 %)  |
| `rrf` + Gatter | 10       | 580/900 (64,4 %) | 47/90 (52,2 %)             | 506/900 (56,2 %)  |

## Unerwartetes

- **Der `manual`-Fallkorpus ist inzwischen 12 statt 3 Fälle.** Die
  Referenzdateien `tune-rrf-manual.json` / `tune-dbsf-manual.json` aus #3169
  tragen nur die 3 kommunalwiki-Fälle (`manual-kommunalwiki-*`); der aktuelle
  `evals/retrieval/cases.ts` zählt 12 `kind: 'manual'`-Einträge (bestätigt per
  `grep -c "kind: 'manual'" evals/retrieval/cases.ts`), die restlichen 9
  decken andere Sammlungen ab. Beide neuen Läufe
  (`tune-join-rrf-manual.json`, `tune-join-dbsf-manual.json`) laufen deshalb
  über alle 12 Fälle (GESAMT rrf 91,7 %/0,917; GESAMT dbsf 100 %/1,000), die
  Tabellenspalte "manual (3 Fälle)" oben zieht gezielt nur die 3
  kommunalwiki-Fälle per Fall-ID heraus — deren Ränge sind byte-identisch zur
  Referenz (rrf: rank 1, rank 1, miss; dbsf: rank 1, rank 1, rank 1), also
  auch hier keine Verschiebung durch den Join. Wann und wodurch der Korpus auf
  12 Fälle wuchs, wurde nicht recherchiert (vermutlich im Zuge von PR #3168,
  „rechunk-from-fulltext", ungeprüft).
- **`dbsf`-notebook ist der einzige Arm mit einer MRR-Verschlechterung
  gegenüber seiner eigenen Referenz** (0,361 → 0,350, `kommunalwiki-laerm`
  rank 9 → rank 14) statt nur einer Umschichtung ohne Netto-Effekt wie bei
  `rrf`-notebook. Reine Beobachtung, keine Bewertung.
- **Die beiden Rerank-Läufe liefen nicht mit „ein paar Minuten Abstand"**,
  wie der Brief vorschlägt — ein mehrminütiger `sleep` ist in dieser
  Umgebung als Werkzeug blockiert, dazwischen lagen nur die reguläre
  Befehlslaufzeit (~30 s). Beide Läufe fragen nur 10 Cross-Encoder-Aufrufe an
  (deutlich unter GreenPTs 600/15-min-Kontingent); in keinem der beiden Logs
  taucht ein Fehler, ein 429, ein Timeout oder ein Circuit-Breaker-Hinweis
  auf, insofern kein Hinweis auf einen stillen Rückfall auf Regolo.
- **Die Referenz-Mediane (383 ms `rrf`, 498 ms `dbsf`) standen nicht in der
  Brief-Vorlage** (dort leer) und wurden nachträglich per
  `eval:retrieval:compare <datei>.json <datei>.json` (Selbstvergleich) aus den
  bestehenden Referenzdateien gezogen, nicht neu gemessen.
- **`compareOutcomes`s Medianwert für den Gatter-Lauf (383 ms) weicht leicht
  vom Live-Ausdruck des Eval-Skripts selbst ab (380 ms** unter „Wanduhr je
  Suche" im Terminal). Vermutlich eine Rundungs- oder Berechnungsdifferenz
  zwischen den beiden Ausgabestellen; für die Tabelle durchgehend der
  `compareOutcomes`-Wert verwendet, wie in Step 6 vorgegeben.
- Sonst nichts: keine abgebrochenen Läufe, keine Fehlermeldungen, keine Zeile
  ohne Deckungsgrad wo einer erwartet war.

## Entscheidung

**R1 (Join als Default):** bestanden. Verglichen wurden `tune-rrf*.json` gegen
`tune-join-rrf*.json` auf allen drei Pipelines: qa 1 Fall gewonnen
(`kommunalwiki-laerm` rank 2 → rank 1), MRR@10 0,642 → 0,692, kein Fall
verloren; notebook 1 Fall verschoben, ohne Netto-Effekt auf die Metrik
(`kommunalwiki-jugend` miss → rank 18, ausserhalb von MRR@10), MRR@10
0,567 → 0,567; manual unverändert, 2/3 → 2/3 auf Rang 1. Die 42
Kontrollfälle bleiben auf allen drei Pipelines rangidentisch.
`HYBRID_SERVER_SCORE_JOIN` steht damit auf true.

**Bonus-Sonderfall:** der qa-Pfad verlor keinen Fall; der +0,05-Hybrid-Bonus
bleibt unverändert und feuert wieder auf dem Server-Pfad.

**R2 (dbsf als Default):** nicht bestanden, Bedingung für Bedingung:

1. MRR@10 gegen `rrf` mit Join — qa: `dbsf` 0,813 vor `rrf` 0,692 (Sieg für
   `dbsf`); notebook: `dbsf` 0,350 hinter `rrf` 0,567 (Verlust für `dbsf`):
   nicht erfüllt, da nur eine der beiden Pipelines gewinnt.
2. höchstens ein Fall gegen den ausgelieferten Zustand: nicht erfüllt — auf
   der Notebook-Pipeline fällt Hit@1 von 50 % (`tune-rrf-notebook.json`) auf
   30 % (`tune-join-dbsf-notebook.json`), also zwei Fälle, und einer davon
   liegt sogar unter der eigenen `dbsf`-Referenz aus #3169
   (MRR@10 0,361 → 0,350, `kommunalwiki-laerm` rank 9 → rank 14) — die
   Umstellung auf den dichten Kosinus-Schnitt hat die Inversion von `dbsf`
   auf dem Notebook-Pfad also NICHT aufgelöst. Der Grund ist beim Nachlesen
   sichtbar: die dichte Spiegelsuche trägt dieselbe `score_threshold` wie der
   Schnitt (`hybridSearch.ts`, Prefetch-Spread), ein `dense_similarity` liegt
   also per Konstruktion immer über der Schwelle — der Schnitt ist dort eine
   Tautologie und greift nur bei Treffern ohne Join-Wert (Deckungsgrad-Tabelle
   oben, ≈ 36 % der Treffer), und dort weiter auf dem Fusionswert. Die
   Inversion von `dbsf` sitzt damit nicht an der Schwelle, sondern in der
   Rangfolge der ungedeckten Treffer und den Stufen dahinter
   (`selectAcrossQueryGroups`, `expandResultsToChunks`) — Letzteres ungeprüft.
3. 42 Kontrollfälle rangidentisch: erfüllt (Tabelle oben, Spalte
   „42 Kontrollfälle identisch?", durchgehend „ja").
4. manual 3/3 auf Rang 1: erfüllt (`tune-join-dbsf-manual.json`, byte-identisch
   zur Referenz aus #3169).

Da Bedingung 1 und 2 bereits nicht erfüllt sind, bleibt `HYBRID_SERVER_FUSION`
auf `rrf`.

**R3 (Auflösungsgrenze):** „der Vorsprung beträgt genau einen Fall und gilt
als nicht aufgelöst — kein Rollout auf weitere Sammlungen." Der Join-Default
gilt für kommunalwiki; der PR trägt keine Rollout-Empfehlung über das hinaus,
was #3118 bereits sagt.

**R5 (Latenz):** Median searchTimeMs 406 ms → 391 ms (−3,7 %). Unter 25 %,
keine weitere Massnahme.

**Deckungsgrad (Offene Frage 2 und 4 der Spec):** dense join 64,1 %
(577/900), sparse join 56,6 % (509/900) — Zahlen des gewählten Arms (`rrf`
mit Join). Beide Anteile liegen über der Hälfte, aber ein gutes Drittel der
Fusionstreffer bleibt ohne eigenen Wert aus der jeweiligen Vorabholung. Der
Anteil ist damit nicht klein genug, um ihn zu ignorieren, aber auch kein
Totalausfall — der nächste Schritt ist deshalb kein neuer Regler, sondern die
Frage, ob der dichte Boden auf der Vorabholung (`score_threshold`) zu eng
sitzt und Treffer der Spiegelsuche systematisch abschneidet.

**Was NICHT entschieden wurde:** die Sortierung auf dem Mehr-Sammlungs-
Notebook-Pfad bleibt auf `similarity` (Offene Frage 1 der Spec) — es gibt bis
heute keinen Eval-Fall, der eine migrierte und eine nicht migrierte Sammlung
in einem Lauf mischt.
