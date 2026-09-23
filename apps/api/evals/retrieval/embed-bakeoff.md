# Embedding-Bake-off — Vorlage

> Kopf und Spalten stehen; die Zahlen trägt der Lauf ein. Ohne ausgefüllte
> Kopfzeilen ist die Tabelle keine Messung, sondern eine Behauptung: welche
> Sammlungen, welcher Tiefen-/Rerank-Arm und welcher Stand die Zeilen erzeugt
> haben, ist aus den Zahlen nicht rekonstruierbar.

- **Datum:**
- **Commit:**
- **Qdrant:** `QDRANT_URL` =
- **Fälle:** 52 (`evals/retrieval/cases.ts`), Pipeline `EVAL_PIPELINE=` , Tiefe `EVAL_DEPTH=`
- **Rerank-Arm:** ohne / mit (`EVAL_RERANK=1`)
- **Basis:** `mistral-embed`, 1024 Dim. — der Arm ohne `EVAL_EMBED_CANDIDATE`

## Ablauf je Kandidat

```bash
pnpm --filter @gruenerator/api eval:retrieval:embed:build -- \
  --candidate <slug> --collections <quelle1>,<quelle2>
EVAL_EMBED_CANDIDATE=<slug> pnpm --filter @gruenerator/api eval:retrieval
EVAL_EMBED_CANDIDATE=<slug> pnpm --filter @gruenerator/api eval:retrieval:ann
# am Ende, wenn alle Kandidaten gemessen sind:
pnpm --filter @gruenerator/api eval:retrieval:embed:build -- --delete
```

## Gesamt

| Kandidat                | Dim. | Sammlung                           | Hit@1 | Hit@3 | Hit@5 | MRR@10 | ANN recall@10 | Token | Kosten |
| ----------------------- | ---: | ---------------------------------- | ----: | ----: | ----: | -----: | ------------: | ----: | -----: |
| `mistral-embed` (Basis) | 1024 | (Produktion)                       |       |       |       |        |               |       |        |
| `bge-m3`                | 1024 | `eval_embed_bge-m3__*`             |       |       |       |        |               |       |        |
| `bge-gemma2-greenpt`    | 3584 | `eval_embed_bge-gemma2-greenpt__*` |       |       |       |        |               |       |        |
| `qwen3-8b-greenpt`      | 4096 | `eval_embed_qwen3-8b-greenpt__*`   |       |       |       |        |               |       |        |
| `qwen3-8b-regolo`       | 4096 | `eval_embed_qwen3-8b-regolo__*`    |       |       |       |        |               |       |        |

## Je Sammlung

| Kandidat | Dim. | Sammlung | Hit@1 | Hit@3 | Hit@5 | MRR@10 | ANN recall@10 | Token | Kosten |
| -------- | ---: | -------- | ----: | ----: | ----: | -----: | ------------: | ----: | -----: |
|          |      |          |       |       |       |        |               |       |        |

## Abnahmeregel (vorab festgelegt)

Ein Kandidat gewinnt nur, wenn Hit@1 **und** MRR@10 über alle 52 Fälle steigen
**und** keine Sammlung um mehr als einen Fall verliert. Sonst bleibt
`mistral-embed`. Eine Dimension ≠ 1024 heisst ausserdem: der Produktionswechsel
wäre eine Sammlungs-Neuanlage (kein `updateCollection`), also expand → backfill
→ contract wie die BM25-Migration, plus Neukalibrierung von
`dense_similarity`-Schwelle und den `HYBRID_*`-Schnitten — die hängen am Modell.

## Notizen zum Lauf

- **`--limit` ist ein Rauchtest, nie eine Messung.** Die Punkte kommen in
  Scroll-Reihenfolge, nicht nach Relevanz — die Gold-Dokumente der 52 Fälle sind
  in einem gekürzten Aufbau in aller Regel gar nicht enthalten. Eine Zahl aus
  einem `--limit`-Lauf gehört in keine Zeile dieser Tabelle; sie belegt nur, dass
  Anbieter, Dimension und Upsert-Pfad funktionieren.
- ANN recall@10 unter 95 % heisst: der HNSW-Index der Wegwerf-Sammlung war noch
  nicht fertig gebaut. Die Retrieval-Zahlen derselben Sammlung sind dann kein
  Modellbefund.
- `x-cortecs-provider` je Lauf (nur `bge-m3`):
- Aufgefallen, aber nicht gemessen:
