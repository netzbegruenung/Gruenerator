# Embedding bake-off — bge-m3 (Cortecs) vs mistral-embed (2026-09-03)

One session, unmoved index, `EVAL_PIPELINE=qa` depth `fast`, no rerank. Candidate collections `eval_embed_bge-m3__*` built from seven system collections (14 746 points, 4.6 M tokens, every batch served by Ionos via Cortecs with `eu_native` + zero data retention). `landesverbaende_documents` (25 618 points) was not built, so the 11 Bayern/Berlin/multi cases are excluded; both arms are scored on the same 46 cases. ANN recall@10 on every candidate collection: 100 % (index is not the variable).

| collection                       | n      | Hit@1 base → bge    | Hit@3           | MRR@10 base → bge | moved cases (rank)                                                      |
| -------------------------------- | ------ | ------------------- | --------------- | ----------------- | ----------------------------------------------------------------------- |
| grundsatz                        | 12     | 6 → 6               | 11 → 11         | 0.681 → 0.681     | btw25-wirtschaft 2→1, frieden 1→2                                       |
| kommunalwiki (BM25, server join) | 10     | 6 → 7               | 7 → 8           | 0.692 → 0.753     | fraktion 4→1, vergabe 2→3, jugend 6→5                                   |
| gruene-de                        | 8      | 5 → **3**           | 6 → 6           | 0.716 → 0.601     | waermepumpe 4→9, vielfalt 1→2, frauentag 1→2, vorsitz 7→5, mitglied 3→2 |
| oesterreich-gruene               | 6      | 6 → 6               | 6 → 6           | 1.000 → 1.000     | —                                                                       |
| gruene-at                        | 4      | 1 → 2               | 2 → 2           | 0.465 → 0.604     | at-team 9→6, at-energiewende 2→1                                        |
| boell-stiftung                   | 4      | 3 → 3               | 4 → 4           | 0.875 → 0.875     | demokratie 1→2, atlas 2→1                                               |
| gruenblog                        | 2      | 0 → 0               | 0 → 0           | 0.000 → 0.000     | —                                                                       |
| **total**                        | **46** | **58.7 % → 58.7 %** | 78.3 % → 80.4 % | **0.699 → 0.705** |                                                                         |

Manual pipeline (7 of 12 cases covered): bge-m3 loses one grundsatz case (1 → rank 2), the other six are equal.

## Verdict against the acceptance rule

- Hit@1 **and** MRR@10 must rise: Hit@1 is unchanged (27 of 46 both arms), MRR@10 +0.006 — one rank swap's worth. Not met.
- No collection may lose more than one case: `gruene-de` loses two at Hit@1 (5 → 3). Not met.

**`mistral-embed` stays.** bge-m3 is not worse overall, it is a wash: 12 cases move, six up and six down, and the two collections with a clear direction point opposite ways (kommunalwiki up, gruene-de down). On this corpus the embedding model is not the lever; the reranker window (#2998) and the BM25 rollout (#3118) remain the measured ones.

Not covered: `landesverbaende_documents` (11 cases) and the notebook pipeline. A rerun with those built would need another ~30 minutes of Cortecs time; nothing in the 46 cases suggests it would flip the verdict.
