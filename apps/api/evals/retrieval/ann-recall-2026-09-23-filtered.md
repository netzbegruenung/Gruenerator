# ANN recall on `documents` under production filters (2026-09-23)

`pnpm --filter @gruenerator/api eval:retrieval:ann`, live Qdrant, read-only. Live optimizer on `documents` is still `indexing_threshold 10000 / max_segment_size 20000` KB: the segment-ceiling PATCH from #3193 has not been applied yet.

```
── ANN recall@10 (approximate vs exact) ──
grundsatz_documents              100.0%
gruene_de_documents              100.0%
kommunalwiki_documents           99.4%
oesterreich_gruene_documents     100.0%
landesverbaende_documents        98.3%
boell_stiftung_documents         100.0%
gruenblog_documents              100.0%
gruene_at_documents              100.0%
GESAMT                           99.5%

── documents (gefiltert wie in Produktion; nicht in GESAMT) ──
segments_count=33 indexed_vectors_count=84223 points_count=86689 · 12 Fragen je Zeile
Filter                                    Punkte  recall@10  hnsw_ef=1
unfiltered (nicht Produktion)              86689     97.5%      79.2%
notebook notebook-user-ausschreibungen      1351    100.0%     100.0%  Full-Scan, HNSW nicht gemessen
user_id #1                                 15034     99.2%      71.7%
user_id #2                                 11342    100.0%      85.0%
user_id #3                                  7944     96.7%      84.2%
user_id #4                                  4546    100.0%      93.3%
user_id #5                                  4475    100.0%      86.7%
```

## Reading

- The 2026-09-03 filtered row ("100.0 %") was a full scan. The eval notebook holds 1 351 points, below `full_scan_threshold` (10000 KB, about 2 500 vectors of 4 KB, checked per segment), so Qdrant answers it exactly through the `document_id` payload index. The `hnsw_ef=1` control shows it: a real graph walk with the smallest beam loses neighbours, a full scan does not. The two eval notebook cases also share one document set, so the old arm ran the same filter twice.
- Where HNSW actually works under a production filter (the five largest `user_id` sets, 4 475 to 15 034 points), recall@10 is 96.7 to 100 %. Nothing is under the 95 % mark that #3189 set for raising `ef`, so `hnsw_ef`/`ef_construct` stay as they are.
- Not measured directly: a notebook whose document set is large enough for HNSW. Single documents reach 3 326 points, so such notebooks exist. The `user_id` rows use the same keyword-index path without `payload_m` and are the closest proxy.
- 12 questions per row: one missed neighbour moves a row by about 0.8 pp.
