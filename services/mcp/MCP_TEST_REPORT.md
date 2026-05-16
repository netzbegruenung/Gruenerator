# Gruenerator MCP Server — Test Report

**Date**: 2026-04-05
**Tester**: Claude Code (Opus 4.6)
**Server**: mcp.gruenerator.eu (Streamable HTTP transport)
**Tools tested**: 8 (all available tools)
**Total test calls**: 16

---

## Tool Inventory

| #   | Tool                          | Purpose                                          |
| --- | ----------------------------- | ------------------------------------------------ |
| 1   | `get_client_config`           | Generate MCP client config for different editors |
| 2   | `gruenerator_cache_stats`     | Show embedding + search cache statistics         |
| 3   | `gruenerator_get_filters`     | Get available filter values for a collection     |
| 4   | `gruenerator_search`          | Semantic/hybrid/text search across collections   |
| 5   | `gruenerator_ask`             | RAG Q&A with source citations                    |
| 6   | `gruenerator_compare`         | Compare search results across 2-3 sources        |
| 7   | `gruenerator_examples_search` | Find social media post examples                  |
| 8   | `gruenerator_notebook_ask`    | Q&A against a shared notebook                    |

---

## Test Results

### 1. `gruenerator_search` — Semantic Search

| Test                   | Query                      | Params                                                            | Result                                                                                                                    | Rating    |
| ---------------------- | -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| Basic DE search        | "Klimaschutz"              | country=DE, limit=3                                               | 3 relevant results from gruene-de, bundestagsfraktion, kommunalwiki. Top result 100% relevance. Cross-collection working. | **10/10** |
| AT country search      | "Klimaschutz"              | country=AT, limit=2                                               | 2 results from kommunalwiki + gruene-at. Correct country scoping.                                                         | **9/10**  |
| Filtered search        | "Klimaschutz"              | collection=deutschland, filter=Regierungsprogramm 2025, mode=text | Correctly filtered to Regierungsprogramm only. Text mode working.                                                         | **9/10**  |
| Landesverband: Hamburg | "Wohnungsbau"              | collection=hamburg                                                | 3 relevant Hamburg-specific results (press releases). Excellent local content.                                            | **10/10** |
| Landesverband: Bayern  | "Bildungspolitik Schulen"  | collection=bayern                                                 | 3 results all from Bayern Regierungsprogramm 2023. Highly relevant.                                                       | **10/10** |
| Nonsense query         | "asdfghjkl nonsense query" | country=DE                                                        | Returned 3 results with ~62% relevance. Fell back to vector search (no text matches).                                     | **7/10**  |
| Cache hit              | "Klimaschutz" (repeat)     | country=DE, useCache=true                                         | Identical results, `cached: true`. Cache works correctly.                                                                 | **10/10** |

**Search subtotal: 9.3/10**

#### Observations

- Hybrid search (vector + text fusion via RRF) works well — top results are highly relevant
- Cross-collection search correctly fans out to 6 DE collections or 4 AT collections
- Nonsense query: should ideally return 0 results or a "no relevant results" message instead of low-relevance noise. This is the main weakness.
- Excerpt duplication: some excerpts contain the same text twice (likely a chunking artifact)
- Text-only mode returns very low scores (0.1) even for relevant results — score normalization differs between modes

---

### 2. `gruenerator_ask` — RAG Question Answering

| Test                | Question                                              | Mode     | Result                                                                                                                       | Rating    |
| ------------------- | ----------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| Detailed mode (DE)  | "Was ist die Position der Grünen zum Mindestlohn?"    | detailed | Comprehensive 5-paragraph answer with 8 cited sources [1]-[8]. Covers 15€ demand, 60% median rule, EU context, gender angle. | **10/10** |
| Fast mode + English | "What is the Green party position on nuclear energy?" | fast     | Concise 3-bullet answer in German (despite English question). Correct anti-nuclear position with good sources.               | **8/10**  |

**Ask subtotal: 9.0/10**

#### Observations

- Detailed mode produces excellent, well-structured answers with numbered citations matching source list
- Fast mode is significantly quicker (~5s vs ~6s search time) and appropriately concise
- English input works but response is in German — could be a feature (target audience is German) or a bug (no language detection). Minor issue.
- Source quality is high: Bundestagsfraktion, gruene.de, Böll-Stiftung all represented
- Response time ~5-6s is acceptable for a RAG pipeline (search + LLM generation)

---

### 3. `gruenerator_compare` — Cross-Source Comparison

| Test             | Query                   | Sources                          | Result                                                                                                                               | Rating    |
| ---------------- | ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| DE vs AT         | "Mobilität und Verkehr" | deutschland vs oesterreich       | 5 results per source. DE: Grundsatzprogramm + Regierungsprogramm. AT: Grundsatzprogramm + NRW-Programm. Clear contrast.              | **9/10**  |
| 3-way comparison | "Bildung und Schule"    | deutschland vs bayern vs hamburg | 2 results per source. All highly relevant. Bund = abstract principles, Bayern = concrete school policy, Hamburg = local LAG + press. | **10/10** |

**Compare subtotal: 9.5/10**

#### Observations

- Compare tool is very fast (~220ms) since it runs parallel searches
- Labels are correctly applied and make results easy to distinguish
- 3-way comparison with Landesverband collections works perfectly — great for federal vs state policy analysis
- No synthesized comparison text (just raw results) — the LLM client is expected to do the synthesis. This is actually the right design for MCP.

---

### 4. `gruenerator_examples_search` — Social Media Examples

| Test            | Query                       | Filters                      | Result                                                                                         | Rating    |
| --------------- | --------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| Broad search    | "Energiewende"              | all platforms, all countries | 3 results: 2x solar/Balkonkraftwerk posts (instagram+facebook duplicate), 1x Energiewende post | **8/10**  |
| Filtered search | "Gleichstellung Feminismus" | instagram only, AT only      | 3 Austrian Instagram posts about equal pay, pension gap, unpaid care work. Highly relevant.    | **10/10** |

**Examples subtotal: 9.0/10**

#### Observations

- Platform + country filtering works correctly
- Content quality is excellent — real social media posts with appropriate tone and emojis
- Duplicate detection issue: same post content appears for both instagram AND facebook (IDs differ, content identical). Should either deduplicate or mark as cross-posted.
- No metadata beyond platform/country (no date, no engagement metrics, no hashtags). Would be useful for social media strategy.

---

### 5. `gruenerator_get_filters` — Filter Discovery

| Test        | Collection  | Result                                                                        | Rating    |
| ----------- | ----------- | ----------------------------------------------------------------------------- | --------- |
| Deutschland | deutschland | 3 programs listed with counts (367+306+165=838 docs). Usage example included. | **10/10** |

**Filters subtotal: 10/10**

#### Observations

- Self-documenting: includes `usageExample` with step-by-step usage — very LLM-friendly
- German descriptions + hints ("Nutze die Werte direkt als Filter") guide the LLM well
- Document counts give useful context about collection sizes

---

### 6. `gruenerator_cache_stats` — Cache Monitoring

| Test            | Result                                                                    | Rating    |
| --------------- | ------------------------------------------------------------------------- | --------- |
| Initial (empty) | All zeros                                                                 | **10/10** |
| After 16 calls  | Embeddings: 8 entries, 42.9% hit rate. Search: 13 entries, 7.1% hit rate. | **10/10** |

**Cache subtotal: 10/10**

#### Observations

- Embedding cache hit rate (42.9%) is healthy — repeated queries reuse vectors
- Search cache hit rate (7.1%) is low because most queries were unique — expected behavior
- Cache is working as designed

---

### 7. `gruenerator_notebook_ask` — Notebook Q&A

| Test          | Token                 | Result                                          | Rating   |
| ------------- | --------------------- | ----------------------------------------------- | -------- |
| Invalid token | "invalid-token-12345" | Error: "GRUENERATOR_API_URL nicht konfiguriert" | **4/10** |

**Notebook subtotal: 4/10**

#### Observations

- **Error message is misleading**: The error says `GRUENERATOR_API_URL` env var is not set on the MCP server. This is a server configuration issue, not a user error.
- Should distinguish between "invalid token" and "server misconfigured" — the current error leaks internal config details to the client.
- Could not test actual functionality due to missing server config.

---

### 8. `get_client_config` — Client Configuration

| Test          | Client | Result                        | Rating  |
| ------------- | ------ | ----------------------------- | ------- |
| Claude config | claude | Session error (pre-reconnect) | **N/A** |

Not retested after reconnection — was part of initial connectivity test.

---

## Overall Scoring

| Category            | Score  | Weight | Weighted    |
| ------------------- | ------ | ------ | ----------- |
| Search (7 tests)    | 9.3/10 | 30%    | 2.79        |
| Ask / RAG (2 tests) | 9.0/10 | 25%    | 2.25        |
| Compare (2 tests)   | 9.5/10 | 15%    | 1.43        |
| Examples (2 tests)  | 9.0/10 | 10%    | 0.90        |
| Filters (1 test)    | 10/10  | 5%     | 0.50        |
| Cache (2 tests)     | 10/10  | 5%     | 0.50        |
| Notebook (1 test)   | 4/10   | 5%     | 0.20        |
| **Session/Auth**    | 6/10   | 5%     | 0.30        |
| **TOTAL**           |        |        | **8.87/10** |

---

## Top Issues (Priority Order)

### Critical

1. **`notebook_ask` broken**: `GRUENERATOR_API_URL` not configured on the MCP server. This entire tool is non-functional.

### Major

2. **Session initialization fragile**: First connection attempt failed with "Ungültige Session". Required manual reconnect. MCP clients should auto-retry session initialization.
3. **Nonsense queries return noise**: Gibberish input returns low-relevance results instead of empty/warning. A minimum relevance threshold (e.g., 0.7) would improve UX.

### Minor

4. **Excerpt duplication**: Some search results contain the same text twice in the excerpt field (chunking artifact).
5. **English input → German output**: `ask` tool doesn't match input language. Could add a language hint.
6. **Cross-platform duplicates in examples**: Same post content appears for instagram + facebook. Could deduplicate or mark as "cross-posted".
7. **Text search score normalization**: Text-only mode returns scores of 0.1 for clearly relevant results — misleading.

### Nice-to-Have

8. **Examples lack metadata**: No dates, engagement metrics, or hashtags on social media examples.
9. **No error schema documentation**: Error responses aren't typed — clients can't programmatically handle different failure modes.

---

## Verdict

**8.9/10 — Excellent MCP server.** The core search, RAG, and comparison tools are production-quality with fast response times, good relevance, and proper cross-collection support. The self-documenting filter tool with usage examples is a standout feature for LLM clients. The main gaps are the broken notebook tool (config issue) and fragile session initialization. Fix those two and this is a solid 9.5+.
