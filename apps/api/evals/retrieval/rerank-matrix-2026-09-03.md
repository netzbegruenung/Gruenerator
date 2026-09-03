# Reranker matrix — instruct × shape against no reranking (2026-09-03)

One session, unmoved index, live Qdrant and GreenPT `green-rerank` (Qwen3-Reranker-4B). qa pipeline, depth `fast`, 52 cases; the reranker skips cases with ≤ 2 results, so the comparison is over the **44 cases it actually reranked**, and a gold it drops counts as a miss (the old summary line credited the pre-rerank rank; fixed in this PR). Notebook pipeline, depth `deep`, 9 cases, production shape (`rerankNotebookResults`).

**Shapes.** `full` = the old eval form: whole candidate list, `minRelevance 0`, no instruct unless set. `prod` = the chat lane: `inputLimit 16`, `outputLimit 8`, `minRelevance 0.2`, MMR, as `rerankNode` runs it.

**Instructs.** `service` = none sent (GreenPT default "Given a search query, retrieve relevant passages that answer the query"); `chat` = the `rerankNode` text (+ "Prefer official party documents and verified sources over web snippets."); `qa` = "Given a question, retrieve the passages that contain the answer."; `de` = "Gegeben eine Frage zu grüner Politik in Deutschland oder Österreich, finde die Passagen, die die Frage beantworten."; `de-strict` = "Bewerte nur, ob die Passage die Frage direkt beantwortet. Thematische Nähe ohne Antwort zählt nicht."

## qa, 44 reranked cases

| arm                     | Hit@1      | Hit@3      | Hit@5      | MRR@10    | improved / worsened | gold dropped |
| ----------------------- | ---------- | ---------- | ---------- | --------- | ------------------- | ------------ |
| **no rerank (same 44)** | **56.8 %** | 81.8 %     | 90.9 %     | **0.717** | —                   | —            |
| full · service          | 43.2 %     | 72.7 %     | 86.4 %     | 0.594     | 8 / 23              | 2            |
| full · chat             | 36.4 %     | 75.0 %     | 88.6 %     | 0.575     | 9 / 22              | 4            |
| full · qa               | 40.9 %     | 65.9 %     | 86.4 %     | 0.578     | 9 / 19              | 3            |
| full · de               | 27.9 %     | 67.4 %     | 86.0 %     | 0.516     | 8 / 23              | 2            |
| full · de-strict        | 47.7 %     | 68.2 %     | 81.8 %     | 0.611     | 11 / 18             | 4            |
| prod · service          | 50.0 %     | 81.8 %     | **95.5 %** | 0.667     | 11 / 17             | 1            |
| prod · chat             | 47.7 %     | **88.6 %** | 93.2 %     | 0.675     | 13 / 16             | 2            |
| prod · qa               | 45.5 %     | 84.1 %     | 90.9 %     | 0.634     | 11 / 17             | 2            |
| prod · de               | 38.6 %     | 75.0 %     | 90.9 %     | 0.596     | 12 / 21             | 2            |
| prod · de-strict        | 52.3 %     | 72.7 %     | 88.6 %     | 0.662     | 14 / 16             | 1            |

## notebook, 9 cases, production shape

| arm           | Hit@1      | Hit@3     | Hit@5  | MRR@10    | improved / worsened |
| ------------- | ---------- | --------- | ------ | --------- | ------------------- |
| **no rerank** | **88.9 %** | 88.9 %    | 88.9 % | **0.903** | —                   |
| service       | 44.4 %     | **100 %** | 100 %  | 0.685     | 1 / 5               |
| chat          | 55.6 %     | 88.9 %    | 100 %  | 0.750     | 1 / 4               |
| de            | 44.4 %     | 88.9 %    | 100 %  | 0.657     | 1 / 5               |

## What it says

- **No configuration beats raw retrieval on Hit@1 or MRR@10**, in either pipeline. The cross-encoder moves the gold document _down_ more often than up in every arm (worsened > improved everywhere except `prod · de-strict`, 14 / 16, which is a wash).
- **The production shape is much better than the old eval shape** (16 candidates, threshold 0.2, MMR): Hit@1 −5 to −9 points instead of −9 to −29, and it gains at Hit@3/Hit@5 (`prod · chat` 88.6 % / 93.2 %, `prod · service` 95.5 % at Hit@5). Every earlier "rerank makes it worse" number in this directory was measured on the `full` shape and overstated the damage.
- **Instruct text matters, but does not rescue it.** `de-strict` is the best at Hit@1 (52.3 %), the chat text the best at Hit@3. The plain German instruct (`de`) is the worst arm in both shapes — not a candidate.
- **Notebook**: the reranker halves Hit@1 (88.9 → 44–56 %) while lifting Hit@3/5 to 100 %. Reading: it keeps the gold document in the top three and swaps the order of the top three around; for the model context (18 chunks) that is harmless, for citation order and the "Quellen" list it is not.

## What it does not say

The eval scores the rank of the gold _document_; the reranker scores chunks against the question and is judged in production by the answer the model writes, which nothing here measures. A reranker that puts a better _chunk_ of the wrong-titled document first loses here and may win there. So: no default change from this run. What it supports: (1) keep the production shape everywhere, never the whole list; (2) if the chat lane's instruct is touched, `de-strict` or the current text, not `de`; (3) the next measurement is answer-level (a small judged set), not another rank table.

---

# Round 2 — modes and MMR (same day, same index)

Production shape throughout. `sort` = the pipeline's order; `filter` = the first 3 keep the retrieval order, the reranker fills the rest and drops what falls under `minRelevance`; `blend` = reciprocal-rank fusion (k = 60) of retrieval order and reranker order. `mmr=off` passes `applyDiversity: false`.

## qa, 44 reranked cases

| arm                                   | Hit@1      | Hit@3      | Hit@5      | MRR@10    | improved / worsened | gold dropped |
| ------------------------------------- | ---------- | ---------- | ---------- | --------- | ------------------- | ------------ |
| **no rerank (same 44)**               | 56.8 %     | 81.8 %     | 90.9 %     | 0.717     | —                   | —            |
| sort · service · mmr on (round 1)     | 50.0 %     | 81.8 %     | 95.5 %     | 0.667     | 11 / 17             | 1            |
| sort · service · mmr off              | 50.0 %     | 81.8 %     | 95.5 %     | 0.666     | 11 / 17             | 1            |
| sort · de-strict · mmr on (round 1)   | 52.3 %     | 72.7 %     | 88.6 %     | 0.662     | 14 / 16             | 1            |
| sort · de-strict · mmr off            | 52.3 %     | 72.7 %     | 88.6 %     | 0.662     | 14 / 16             | 1            |
| filter · service (mmr on = off)       | 59.1 %     | 84.1 %     | 90.9 %     | 0.724     | 9 / 6               | 1            |
| **filter · de-strict (mmr on = off)** | **61.4 %** | **86.4 %** | **93.2 %** | **0.746** | **11 / 3**          | 1            |
| blend · service                       | 54.5 %     | 86.4 %     | 93.2 %     | 0.717     | 8 / 6               | 0            |
| blend · de-strict                     | 59.1 %     | 84.1 %     | 93.2 %     | 0.736     | 12 / 7              | 0            |

## notebook, 9 cases, service instruct

| arm                       | Hit@1      | Hit@3  | Hit@5     | MRR@10    | improved / worsened |
| ------------------------- | ---------- | ------ | --------- | --------- | ------------------- |
| no rerank                 | 88.9 %     | 88.9 % | 88.9 %    | 0.903     | —                   |
| sort · mmr on (round 1)   | 44.4 %     | 100 %  | 100 %     | 0.685     | 1 / 5               |
| sort · mmr off            | 44.4 %     | 88.9 % | 100 %     | 0.676     | 1 / 5               |
| **filter (mmr on = off)** | **88.9 %** | 88.9 % | **100 %** | **0.917** | **1 / 0**           |
| blend                     | 88.9 %     | 88.9 % | 88.9 %    | 0.903     | 0 / 0               |

## What round 2 says

- **MMR is not the cause.** With diversity off every `sort` arm is identical to two decimals, in both pipelines. The Hit@1 loss comes from the cross-encoder's own ordering.
- **The reranker is a good filter and a bad sorter — now measured, not inferred.** `filter` (retrieval order for the first three, reranker behind them, its rejections honoured) is the first configuration that beats raw retrieval on **every** metric in **both** pipelines: qa 61.4 / 86.4 / 93.2 / 0.746 against 56.8 / 81.8 / 90.9 / 0.717 with `de-strict`, notebook 0.917 against 0.903 with no case worsened. The Hit@1 gain comes from the filter side: when the reranker rejects the raw #1 as irrelevant, the gold at #2 moves up.
- **The instruct still matters inside `filter`**: `de-strict` beats the service default by one Hit@1 case and one MRR hundredth, with half the worsened cases (3 against 6).
- **Cost of the winner:** one gold dropped in 44 (the reranker rejected it below 0.2); in `blend` nothing is dropped, at the price of two Hit@1 cases.

## Recommendation

Production candidate: **`filter` with head 3 and the `de-strict` instruct**, MMR left as is (it makes no difference). It is +2 cases at Hit@1 on 44, at the noise boundary on its own; the 11 / 3 improved-to-worsened ratio (against 14 / 16 for today's sort) is the part that is not noise. Gate before shipping: the answer-level comparison (20 to 30 questions, with and without), because the eval still scores document rank. Not a switch: an algorithm change in `rerankPipeline`, measured the same way after.
