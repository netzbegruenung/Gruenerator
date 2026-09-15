# ANN recall before the segment-ceiling PATCH (2026-09-03)

`pnpm --filter @gruenerator/api eval:retrieval:ann`, live Qdrant 1.15.4, read-only. Live optimizer on `documents`: indexing_threshold 10000 / max_segment_size 20000 KB.

```
── ANN recall@10 (approximate vs exact) ──
grundsatz_documents              100.0%
gruene_de_documents              100.0%
kommunalwiki_documents           99.2%
oesterreich_gruene_documents     100.0%
landesverbaende_documents        98.1%
boell_stiftung_documents         100.0%
gruenblog_documents              100.0%
gruene_at_documents              100.0%
GESAMT                           99.3%

── documents (notebook, filtered vs unfiltered; excluded from GESAMT) ──
segments_count=18 indexed_vectors_count=45667
documents (filtered, notebook)   100.0%
documents (unfiltered, notebook) 95.8%
```

The filtered arm is 2 user-notebook cases plus 10 probe questions against both user notebooks (22 filtered queries); the unfiltered row uses the same vectors without the document-id filter. Rerun after `qdrant:patch-hnsw --all` and compare `segments_count` and both `documents` rows.
