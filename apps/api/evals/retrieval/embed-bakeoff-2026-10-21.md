# Embedding bake-off — Qwen3-Embedding-8B (Melious) vs mistral-embed (2026-10-21)

Trigger: on 2026-10-21 Mistral's EU endpoint dropped every embedding model (`400 Invalid model: mistral-embed`, #4797 moved embeddings to the global endpoint). Question: is there an EU-hosted model worth moving to?

One session, `EVAL_PIPELINE=qa` depth `fast`, no rerank. Candidates `qwen3-8b-melious` (4096 dims) and `qwen3-8b-melious-1024` (same model, `dimensions: 1024`, Matryoshka truncation — cosine 0.9999 to the truncated and renormalised 4096 vector). ANN recall@10 on every candidate collection: 100 %. `landesverbaende_documents` was built only for the 1024 arm, so the comparison below drops the 8 Bayern/Berlin cases and scores all three arms on the same 64 cases.

| arm                     | n   | Hit@1      | Hit@3      | Hit@5      | MRR@10    |
| ----------------------- | --- | ---------- | ---------- | ---------- | --------- |
| `mistral-embed` (base)  | 64  | 71.9 %     | **90.6 %** | **95.3 %** | **0.823** |
| `qwen3-8b-melious-1024` | 64  | **73.4 %** | 87.5 %     | 90.6 %     | 0.818     |
| `qwen3-8b-melious`      | 64  | 71.9 %     | 89.1 %     | 90.6 %     | 0.814     |

1024 arm over all 72 cases (incl. Bayern/Berlin): Hit@1 72.2 % → 73.6 %, Hit@3 91.7 % → 87.5 %, MRR@10 0.829 → 0.817.

Hit@1 per collection (base / 1024 / 4096): boell 3/4/4 of 6, gruene-at 3/4/3 of 6, **gruene-de 8/7/7 of 11**, grundsatz 11/11/11 of 16, kommunalwiki 10/10/10 of 14, oesterreich 9/9/9, gruenblog 2/2/2.

Moved cases (rank base / 1024 / 4096):

| case                          | base | 1024 | 4096 |
| ----------------------------- | ---: | ---: | ---: |
| boell-klimagerechtigkeit      |    2 |    1 |    1 |
| gruene-at-frauen              |    2 |    1 |    2 |
| gruene-at-klima               |   11 |    9 |    8 |
| gruene-at-team                |    8 |   17 |    — |
| gruene-de-energie             |    1 |    2 |    2 |
| gruene-de-vielfalt            |    2 |    7 |    7 |
| gruene-de-vorsitz             |    5 |    8 |    7 |
| gruene-de-waermepumpe         |    2 |    6 |    6 |
| grundsatz-btw25-wirtschaft    |    2 |    1 |    1 |
| grundsatz-buergerversicherung |    3 |    2 |    2 |
| grundsatz-frieden             |    1 |    2 |    2 |
| kommunalwiki-fraktion         |    4 |    5 |    5 |
| kommunalwiki-jugend           |    4 |    3 |    3 |
| kommunalwiki-vergabe          |    2 |    4 |    2 |

## Verdict against the acceptance rule

- Hit@1 **and** MRR@10 must rise: MRR@10 falls in both arms. Not met.
- **`mistral-embed` stays.** 4096 dims buy nothing over 1024 at four times the storage. Same picture as `bge-m3` on 2026-09-03: the embedding model is not the lever on this corpus, and `gruene-de` is again the collection that loses.

## Worth keeping

- **Qwen3-Embedding-8B is a viable exit** if Mistral drops `mistral-embed` globally too: close in quality, no input-length problem (5 353 tokens accepted, 20 000 chars), and two hosts serve near-identical vectors — Melious and Cortecs (`x-cortecs-provider: nebius`, on `SOVEREIGN_ZDR_PROVIDERS`), cosine 0.99983 between them. A collection embedded on one host stays searchable through the other.
- Melious: €0.01 per 1 M tokens, `x-ratelimit-limit: 180`; three parallel build processes plus an eval run hit 429. Cortecs is slower per batch (3.1 s vs 2.4 s for 16 texts) but has its own limit.
- **Ruled out: `multilingual-e5-large-instruct` (Melious).** Hard 512-token limit — prose fits (1 600 chars ≈ 360 tokens), but a pipe table of 1 000 chars is rejected (`context_length_exceeded`), so our 1 800-char table chunks would fail.
- Cost of this run: ~24 M tokens ≈ €0.25, two thirds of it `landesverbaende_documents` (26 884 points, 9.7 M tokens) for 8 cases. Next time leave it out unless the Bayern/Berlin cases are the question.
- Building is sequential (~1.5 s per 16-point batch); 4096-dim vectors need 4-point upserts (16 ran into the proxy's 413). Separate processes per collection run in parallel without code changes.

## Not covered

User content (`documents`) — the copier refuses it by design. Switching models for user notebooks only is a separate problem: chunks live in one shared `documents` collection without a notebook id, documents are shared across notebooks, and several searches (chat over several @-notebooks, deep research, the documents page) embed the query once for many documents. A switch would have to be per document with per-model queries and rank fusion, or a full re-embed of `documents` from `chunk_text`.
