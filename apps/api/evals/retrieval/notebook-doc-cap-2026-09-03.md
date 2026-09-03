# Per-document cap in notebook retrieval — measurement (2026-09-03)

`EVAL_PIPELINE=notebook EVAL_DEPTH=deep`, live Qdrant, 9 cases, one session against an unmoved index. `NOTEBOOK_MAX_CHUNKS_PER_DOC` is the only variable. (`EVAL_RERANK=1` is a qa-only switch; the notebook runs with and without it are identical.)

| cap                 | Hit@1  | Hit@3     | Hit@5     | MRR@10    |
| ------------------- | ------ | --------- | --------- | --------- |
| 0 (before)          | 88.9 % | 88.9 %    | 88.9 %    | 0.903     |
| 1                   | 88.9 % | **100 %** | 100 %     | **0.926** |
| **2 (new default)** | 88.9 % | 88.9 %    | **100 %** | 0.911     |
| 3                   | 88.9 % | 88.9 %    | 88.9 %    | 0.907     |

Per case: eight of nine are rank 1 at every cap. `notebook-berlin-hitzeschutz` is rank 8 → 3 (cap 1) → 5 (cap 2) → 6 (cap 3). No case gets worse at any cap.

What this does and does not show: the eval scores the rank of the gold _document_, so five chunks of the right document at ranks 1–5 count the same as one. The cap's purpose — more distinct documents in the candidate pool the reranker and the model see — is visible only in the one case where the gold document was buried under another document's chunks. Answer quality with a broader context is not measured here.
