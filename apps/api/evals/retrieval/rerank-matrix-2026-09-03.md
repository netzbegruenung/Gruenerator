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
