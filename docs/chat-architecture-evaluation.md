# Chat-Architektur: Bewertung und Sanierungsplan

**Stand 2026-07-29 · geprüft gegen `master @ c64ddc53d`** (Zeilenangaben nachgeprüft nach dem Merge von PR #2149)

Dieses Papier hält das Ergebnis von fünf Audit-Runden fest: Bewertung von LangChain **Deep Agents**, dem **Vercel AI SDK v7** und **MCP** als Grundlage für den Chat, dazu eine Bestandsaufnahme aller ~38 Intents, der Recherche-Pipelines und der Notebooks. Es ist als Referenz für künftige Sitzungen gedacht — die Analyse soll nicht in drei Monaten neu bezahlt werden.

Jede Architekturaussage ist mit `datei:zeile` belegt und wurde gegen den oben genannten Commit geprüft. Wo eine Aussage nicht verifiziert werden konnte, steht das ausdrücklich dabei.

> **Lies §11 zuerst.** Die §§1–10 sind eine Bestandsaufnahme vom **29.07.2026** und beschreiben den Zustand **vor** dem Sanierungsprogramm — sie stehen bewusst im Präsens und lesen sich deshalb wie eine Beschreibung von heute. Das sind sie nicht: Das Programm ist abgearbeitet, und was stattdessen gilt, hält [§11](#11-endstand-des-sanierungsprogramms) fest. Wer §2.1 („Zwei Wege, ein LLM aufzurufen", `AIWorkerPool`) für den aktuellen Stand hält, plant gegen eine Architektur, die es nicht mehr gibt — heute führt genau **ein** Weg zum Modell (`services/ai/generate.ts`). Der Hinweis steht hier oben, weil eine Aussage, die man erst 280 Zeilen später zurückgenommen findet, vorher schon jemand geglaubt hat.

---

## 1. Zusammenfassung

**Der Engpass ist nicht fehlende Fähigkeit, sondern dass fast alles doppelt existiert.**

Zwei Wege, ein LLM aufzurufen. Vier Recherche-Maschinen. Drei unabhängige Unterfragen-Planer. Zwei Zitat-Syntaxen. 35 Intents in rund acht handgepflegten Kopien. Kompilierte LangGraph-Graphen mit null Aufrufern neben handsequenzierten Kopien ihrer eigenen Nodes.

Jeder Fehler, der in dieser Untersuchung gefunden wurde, war ein **Divergenz-Symptom, kein Logikfehler**:

- `create_recurring_task` war über den Chat zu 100 % unerreichbar — der Prompt bot 31 Intents an, die Accept-Liste des Parsers kannte 28 (behoben in PR #2149).
- de-AT-Nutzer bekamen den deutschen Korpus — `localeToSearchScope` lag nur im Deep-Pfad (behoben in PR #2149).
- Resume rerankte mit anderer Schwelle als der Normalpfad (`>3` statt `>2`) und schwieg bei Fehlern (behoben in PR #2149).
- „Tiefenrecherche" im Notebook überspringt das Reranking, das „Schnell" macht.

**Konsequenz für die Werkzeugfrage:** Ein zusätzliches Agenten-Harness obendrauf wäre die *fünfte* Recherche-Maschine und der *dritte* LLM-Aufrufweg. Die Empfehlung lautet deshalb: das AI SDK ausreizen, das wir ohnehin fahren, und Duplikate abbauen. Konsolidierung ist zugleich der optionserhaltende Zug — nach ihr kostet der Wechsel auf *irgendein* Harness eine Konfigurationsänderung statt eines Quartals.

---

## 2. Bestandsaufnahme

### 2.1 Zwei Wege, ein LLM aufzurufen

| Weg | Wo | Umfang |
|---|---|---|
| Direkt über das AI SDK | `agenticLoop/loopEngine.ts`, `routes/docs/aiController.ts`, `services/userAgents/agentDraftService.ts` | — |
| `AIWorkerPool` (`worker_threads`-RPC) | `apps/api/workers/aiWorkerPool.ts` + `workers/providers/*Adapter.ts` | ~2.300 Zeilen, **106 Aufrufstellen** |

Der Pool ruft in seinen Adaptern selbst wieder `generateText` aus `ai` auf und übersetzt das Ergebnis zurück in eine Anthropic-förmige Struktur. Für I/O-gebundene HTTP-Aufrufe kauft `worker_threads` keine Nebenläufigkeit, die `async`/`await` nicht schon hätte — die Worker *verteilen*, sie lagern keine CPU-Arbeit aus.

**Das ist die Ursache mehrerer anderer Eigenbauten:** `services/ai/generateStructured.ts` existiert laut eigenem Kopfkommentar, weil der Pool kein Constrained Decoding kann. Auf dem direkten Pfad wäre das `generateObject`. Der Gegenbeweis steht im selben Repo: `agentDraftService.ts` erledigt dieselbe Aufgabe in 130 Zeilen ohne Pool.

### 2.2 Vier Recherche-Maschinen

| # | Implementierung | Lebender Aufrufer |
|---|---|---|
| 1 | `routes/chat/agents/researchOrchestrator.ts` (1139 Z.) | **nur** `services/monitor/HotTopicPipeline.ts:164` (Tagesbriefing) |
| 2 | Linkup-Stufen im agentischen Loop (`services/search/searchDepth.ts`, `agenticLoop/sourceRegistry.ts`) | **die lebende Chat-Recherche** |
| 3 | `agents/langgraph/SearchGraph/` | `/api/search-graph` — ruft die **Nodes einzeln** auf, nicht den Graphen |
| 4 | `agents/langgraph/WebSearchGraph/` | `runWebSearch()` für `/api/search`; zusätzlich node-weise nachgebaut in `searchStreamController.ts` und `deepResearchNodeLegacy` |

Der Chat hat die Recherche mit PR #2137 auf die Websuche-Stufen umgestellt; das `research`-Tool wurde aus `searchTools.ts:257-263` entfernt, der Intent fällt in `searchNode.ts:1359-1360` in den `web`-Zweig. `researchOrchestrator.ts` ist damit aus dem interaktiven Chat heraus — wer ihn „ersetzen" will, verbessert einen Batch-Job.

### 2.3 Tote kompilierte Graphen

`chatGraph.invoke()` und `runSearchGraph()` haben **repoweit null Produktionsaufrufer**. Die Router rufen stattdessen die einzelnen Node-Funktionen von Hand in Reihe (`intentExecutionService.ts`, `chatGraphContractRouter.ts`, zusammen ~3.500 Zeilen imperative Verzweigung). Ebenfalls tot: `apps/api/routes/search/searchContractRouter.ts` (gebaut, absichtlich nicht gemountet, nirgends importiert) und `ChatGraph/llmConfig.ts`s `getAgentLLM`/`createReactAgent`.

**Beleg dafür, dass der Graph nie lief:** `ChatStateAnnotation` in `ChatGraph.ts` ist gegenüber dem lebenden `ChatGraphState` (`ChatGraph/types.ts:518-868`) um ~25 Felder zurückgeblieben. Liefe der Graph, verlöre er sie bei jedem Übergang.

> Wer „wir sind ein LangGraph-Projekt" annimmt, liegt für den Chat-Pfad falsch. Live ist LangGraph in vier *anderen* Graphen (`FlyerToSiteGraph`, `AntragAgentGraph`, `ImageSelectionGraph`, `WebSearchGraph`). `SocialAgentGraph` stand hier als fünfter und war es bei der Niederschrift (29.07.2026) auch. Er verlor seinen einzigen Aufrufer am 10.08.2026, als `routes/texte/social.ts` den Agent-Mode-Zweig abgab (35181109d0), und ist jetzt entfernt.

### 2.4 Drei Unterfragen-Planer, zwei Zitat-Syntaxen

Planer: `researchOrchestrator.planResearchDeep` · `SearchGraph/nodes/queryPlannerNode.ts` · `WebSearchGraph/nodes/PlannerNode.ts`. **Nur der erste** weist die LLM an, den Entitätsnamen in jede Unterfrage zu tragen — der dokumentierte Fix, nachdem „Mona Neubauer / Herkunft" zufällige Bachelorarbeiten zurückgab. Der Fix wurde nie portiert.

Zitate: `[N]` positional-append im `agenticLoop/sourceRegistry.ts` (stabil über Tool-Calls) · `[N]` pro Call neu nummeriert im `researchOrchestrator` · `[cite:N]` in `SearchGraph` und den Exportern. `HotTopicPipeline.ts:281-285` muss `applyCiteMarkers` laufen lassen, damit der Frontend-Renderer überhaupt etwas anzeigt. Genau diese Kollision ist der Grund, warum `research` nie in `AGENTIC_INTENTS` durfte — dokumentiert in `agenticLoop/agenticRespondService.ts:74-79`.

### 2.5 Intents in acht Kopien

35 Intents leben in `searchIntentSchema` (contracts), `intentToToolKey`, der Prompt-Prosa, der Prompt-JSON-Zeile, `NON_SEARCH_INTENTS`, der `INTENT_KEYWORDS`-Exclude-Liste, `INTENT_MESSAGE_POOLS`, `AGENTIC_INTENTS`, `DEMOTABLE_HEURISTIC_INTENTS` und einer Test-Liste. **Beim Hinzufügen eines Intents brechen nur drei davon den Build.** Genau diese Asymmetrie war die Ursache des `create_sheet`- und des `create_recurring_task`-Bugs. Details und ein ausgearbeiteter 7-PR-Entwurf: siehe die Memory-Notiz `chat-dedup-audit-2026-07`.

### 2.6 Der Loop ist live, nicht experimentell

`agenticLoop/flags.ts:13` liest `CHAT_AGENT_LOOP !== 'false'` — **Default an**, Opt-out. Zwei Modi in `loopEngine.ts` (647 Z.): `unified` (Mistral treibt Tools und schreibt) und `split` (fester schneller Planer sammelt Belege, das gewählte Modell schreibt einmal darüber). Budget in `agenticLoop/types.ts:107-114`: `maxSteps` 8, `wallClockMs` 120 s (weich), `hardCapMs` 300 s (hart), `perCallTimeoutMs` 20 s.

Guards in `agenticLoop/loopGuards.ts`: `MAX_FAILURES_PER_TOOL` 2, `MAX_TOTAL_FAILURES` 5, `MAX_SEARCH_CALLS` 6, `MAX_SOURCES` 20, `NEAR_DUPLICATE_JACCARD` 0.6, `MIN_INTERNAL_SOURCES_TO_SKIP_WEB` 3. Alle sind **Closures pro Turn** — sie kennen keine Subagenten.

### 2.7 Chunk-Rerank im Loop: gemessen, Default bleibt aus

`agenticLoop/flags.ts` (`isLoopRerankEnabled()`) liest `LOOP_RERANK_ENABLED`, Default **aus**. Eingeschaltet setzt `toolCatalog.ts` `rerankSearchChunks: true` auf `createSearchTools`; die Option läuft über `searchCollectionOrBundle` (Einzelsammlung **und** AT-Bündel) nach `executeDirectSearch({ rerankChunks: true })` und von dort in `SearchOptions.rerankChunks` — derselbe Cross-Encoder-Pfad, den der Anhang-Fanout (`attachedDocuments.ts`) seit dem Validator-Fix in 03e297cca4 fährt, nicht seit #2816: die Option war seit #2816 gesetzt, aber `DocumentSearchService`s Validator liess `rerankChunks` in den geschachtelten Optionen stillschweigend fallen, bis 03e297cca4 das behob. Der Anhang-Pfad hängt seither hinter demselben `LOOP_RERANK_ENABLED`-Flag wie `gruenerator_search` — sonst hätte der Bugfix den Cross-Encoder für jeden Anhang unbemerkt scharfgeschaltet. Auf dem rerankten Zweig ist das an Qdrant gereichte Limit auf 5 geklemmt, damit `RERANK_LIMIT_CLAMP` den Kandidatenpool nicht über den Cross-Encoder-Deckel treibt. Fällt der Encoder aus, sendet `agenticLoop/rerankWarning.ts` einmal je Turn `rerank_degraded`; der Marker selbst (`rerankDegraded` am Werkzeugergebnis) wird vor dem Modell entfernt (`wrapTools.ts`, `INTERNAL_RESULT_FIELDS`) und beim Turn-übergreifenden Replay erneut gestrippt (`mcpReplay.ts`) — er ist eine Aussage über unsere Infrastruktur, keine, die das Modell lesen soll. Der Anhang-Fanout (`executeMultiDocFanout` in `searchNode.ts:~915-928`) liest von der Antwort nur `results`, nicht `metadata` — eine Degradation des Cross-Encoders kann dort also nicht gemeldet werden, anders als auf dem `gruenerator_search`-Pfad. `directSearchExecutors.ts`s unerreichbarer Fallback-Zweig, der `rerankChunks` mitführte, ist mit #3139 entfernt.

**Gemessen** mit dem loop-förmigen Controller-Lauf (`EVAL_LOOP_RERANK=0|1`, `loopLimit` 10, n=52, Live-Index, 52 GreenPT-Aufrufe im An-Arm):

| Arm | Hit@1 | Hit@3 | Hit@5 | MRR@10 | Median `searchTimeMs` |
|---|---|---|---|---|---|
| aus (loop-förmig, ohne Rerank) | 57,7 % | 80,8 % | 84,6 % | 0,698 | 586 ms |
| an (`rerankChunks: true`) | 55,8 % | 80,8 % | 84,6 % | 0,677 | 1938 ms |

Verschiebungen auf Rang 1: 9 Fälle verloren, 8 gewonnen; bei Top-3: 3 verloren, 3 gewonnen — kein Ausreißer, sondern Rauschen um einen leichten Verlust bei +1,35 s Median-Aufpreis pro Suche. **Entscheidung: `LOOP_RERANK_ENABLED` bleibt aus.** Die dokumentbezogene Eval zeigt keinen Gewinn, der den Aufpreis rechtfertigt — aber sie misst auch nicht das, was der Entwurf eigentlich als Nutzen benennt: welcher CHUNK eines Dokuments nach `truncateText(relevant_content, 800)` beim Modell ankommt. Eine chunk-genaue Messung ist die Anschlussarbeit, bevor der Default kippt.

---

## 3. Bewertung: Deep Agents

**Ergebnis: nicht übernehmen.**

`deepagents` auf npm ist echt und first-party (`langchain-ai/deepagentsjs`, v1.11.1). Die Peer-Deps sind in `apps/api` bereits erfüllt: `langchain 1.5.3`, `@langchain/core 1.2.3`, `@langchain/langgraph 1.4.8`, dazu `@langchain/mistralai 1.2.0`. Einzelne Middleware (`createFilesystemMiddleware`, `createSubAgentMiddleware`, `createSummarizationMiddleware`) sind dokumentierte Top-Level-Exports und mit dem schlanken `createAgent` nutzbar — kein Alles-oder-nichts.

**Der Blocker:** Jedes unserer Tools ist ein AI-SDK-`tool()`; `DynamicStructuredTool` kommt in `apps/api` nirgends vor. Zwischen dem Tool-Protokoll von `streamText` und LangGraph gibt es **keine Brücke**. Deep Agents ist eine parallele Runtime, kein Plugin — ein Umstieg hieße ~2.600 Zeilen Tool-Definitionen neu deklarieren (`toolCatalog`, `searchTools`, `domainTools`, `editorTools`, `personalDataTools`, `mcpCatalog`, `systemMcpCatalog`).

**Was nach Abzug übrig bleibt.** Zieht man ab, was das AI SDK ohnehin liefert (Subagenten als Tool, HITL, Tool-Subsetting, Structured Output, Tool-Timeouts, Idle-Erkennung) und was wir bereits eigen und besser haben (`compactionService` macht LLM-Zusammenfassung, das SDK-Core nur mechanisches Pruning; Grüneratoren als Skills; mem0 als Memory), bleibt als Alleinstellung: **virtuelles Dateisystem, FS-Backends, Pfad-Permissions.** Also der für ein Chat-Produkt am wenigsten relevante Teil.

**Zwei Reizthemen, die nicht ziehen:**
- Prompt-Caching in Deep Agents ist Anthropic/Bedrock-only → No-op auf unserer Mistral/verdigado/Regolo-Lane. Das AI SDK exponiert ebenfalls **kein** Mistral-Caching-Feld (alle dokumentierten `providerOptions.mistral`-Felder geprüft). Unsere Provider können es schlicht nicht.
- Sandboxes sind sämtlich Dritt-Cloud (LangSmith/Daytona/Modal), **ohne EU-Residency-Aussage in den Docs**. Eigene Isolation wäre implementierbar (`SandboxBackendProtocol`), aber dann ist der Gewinn weg.

**Strategisch:** Das JS-Paket ist der jüngere Zwilling; Python bekommt Fähigkeiten zuerst.

---

## 4. Bewertung: AI SDK v7

Wir fahren `ai@7.0.37` und nutzen einen erstaunlich kleinen Teil davon.

### 4.1 Genutzt

`streamText`/`generateText`, `isStepCount` (so heißt es in 7.0.37, nicht `stepCountIs`), `prepareStep` (überschreibt **nur** `toolChoice` und `system`, `loopEngine.ts:114-148`), `repairToolCall`, `abortSignal` (Doppelsignal via `AbortSignal.any`), `wrapLanguageModel` (ausschließlich für Usage-Tracking), `telemetry` (Langfuse, global registriert seit v7 die Per-Call-`tracer`-Option entfiel), `dynamicTool` + `jsonSchema` (nur als Brücke — der MCP-Client ist eigen).

### 4.2 Vorhanden, aber ungenutzt

| Fähigkeit | Was sie bei uns ersetzen würde |
|---|---|
| **`activeTools`** (stabil, in `prepareStep` **pro Step** überschreibbar) | Der Katalog wird heute pro Turn neu gebaut (`buildChatToolCatalog`, 441 Z.). Genau das ist der „per-turn catalog selector = Phase 3n"-TODO in `toolCatalog.ts:28`, `domainTools.ts:16`, `agenticLoop/routing.ts:122` |
| **`toolsContext` + `contextSchema` pro Tool** | Tools **einmal auf Modulebene** definierbar; Request-Werte kommen als typisiertes `context` in `execute`. Ein Tool sieht nur seinen eigenen Context — `runtimeContext` erreicht `execute` **nicht** (nur `prepareStep`, Lifecycle-Callbacks, `toolApproval`) |
| **`timeout: { totalMs, stepMs, firstChunkMs, chunkMs }`** | Möglicherweise `createIdleDeadline` — `chunkMs` ist ausdrücklich Idle-Erkennung. **`toolMs` ersetzt `withTimeout` ausdrücklich NICHT — siehe §4.4** |
| **Natives `toolApproval`** (HMAC-signiert, Replay-Fix in 7.0.36) | Unser HITL (`confirmActionService` + `pendingActionStore` + `resumePipeline`) mit hartkodiertem 6er-Enum. **`agents/langgraph/streamingProcessor.ts:372` verwirft den nativen `tool-approval-request`-Chunk ausdrücklich** |
| **Subagent-Muster** | `agent.generate()` in ein `tool()` wickeln, `toModelOutput` formt, was das Elternmodell sieht. Kontext-Isolation + kompakte Übergabe ohne zweite Runtime |
| `hasToolCall` als `stopWhen` | `forceFinish()`/`forcedToolForStep()`-Closures durch `LoopEngineParams` |
| `onToolExecutionStart`/`-End`, `onStepEnd` | Teile der SSE-Emission in `wrapTools.ts` |
| `createProviderRegistry`/`customProvider` | Die doppelte Provider-Konstruktion (§5.3) |

**`ToolLoopAgent` verliert nichts** — `prepareStep`, `repairToolCall`, `stopWhen`, `toolApproval`, `activeTools`, `runtimeContext`, `toolsContext`, `timeout`, `onStepEnd`, `experimental_sandbox` sind alle da; die Klasse ist ein dünner Wrapper um `generateText`/`streamText`. Was bei uns bliebe, ist die **Orchestrierungs-Policy** (zwei Pässe mit Registry-Render dazwischen, Stall-/Refusal-/Degenerations-Erkennung, Lane-Fallback) — sie zöge in `prepareStep`/Callbacks um, statt zu verschwinden. Es gibt aber auch keinen Grund, eine funktionierende, testbar injizierte 647-Zeilen-Engine ohne Fähigkeitsgewinn umzubauen.

### 4.3 Grenzen — gegen die Quelle verifiziert, nicht aus der Doku paraphrasiert

- **`Output.object()` wirft** bei Schema-Fehler (`NoObjectGeneratedError`) — kein Repair, kein Retry. `repairText` existiert **nur** auf `generateObject`/`streamObject` und ist stabil erst ab **7.0.39** (wir: 7.0.37). Unsere Repair-Runde in `generateStructured` hat für „`Output.object` + Tools" **kein** Gegenstück.
- **Kein Provider-Fallback zur Laufzeit.** `customProvider`s `fallbackProvider` greift nur beim *Nachschlagen*, nie bei Fehlschlag eines Calls. `maxRetries` wiederholt dasselbe Modell. Nur das Vercel **AI Gateway** kann echtes Call-Time-Fallback. → `runPassWithFallback` und `services/providers/providerFallback.ts` bleiben zu Recht.
- **`extractReasoningMiddleware` kann GreenPT nicht retten** — es matcht ausschließlich Regex-Tags im **Text**. Ein separates `message.reasoning`-Feld ist zum Middleware-Zeitpunkt längst verworfen. Der Fix gehört in den GreenPT-Adapter.
- **`createProviderRegistry` ist nicht zur Laufzeit erweiterbar** — `registerProvider` gehört nicht zum öffentlichen Interface. Einmal beim Start bauen.
- **Kein Tokenizer, keine automatische Kompaktierung.** `pruneMessages` ist rein mechanisch; der Schwellwert kommt vom Aufrufer (das offizielle Cookbook schätzt mit `länge / 4`). Unser `compactionService` (LLM-Summary, Schwellen 50 Nachrichten / 24.000 Token, `KEEP_RECENT` 20, `SUMMARY_MAX_TOKENS` 800) kann **mehr** als das SDK.
- **`toModelOutput`:** das rohe `execute()`-Ergebnis bleibt unangetastet in `step.toolResults`; gekürzt wird erst beim Bau der nächsten Modell-Nachricht.

> **Korrektur einer früheren Fehleinschätzung:** `agenticLoop/truncate.ts` zerstört **keine** Daten. `recordStep` und `sendResult` bekommen bereits das volle Ergebnis; nur der Rückgabewert ans Modell wird gekürzt. `wrapTools.vitest.ts:185-197` pinnt genau das. Ein Wechsel auf `toModelOutput` wäre Kosmetik, kein Datenverlust-Fix.

### 4.4 `timeout.toolMs` ersetzt `withTimeout` nicht — nachgelesen, nicht angenommen

Dieses Papier hat in einer früheren Fassung `toolMs` als Ersatz für den handgeschriebenen Tool-Timeout (`wrapTools.ts`) geführt. Die Umsetzung in PR #2151 hat das widerlegt; der Befund gehört hierher, weil er sonst beim nächsten Anlauf erneut bezahlt wird.

**`toolMs` ist kooperativ, nicht erzwingend.** Gegen `ai@7.0.37` gelesen (`node_modules/ai/dist/index.js` ~:2918): das SDK reicht den Wert an `mergeAbortSignals` weiter, macht daraus ein `AbortSignal.timeout(ms)`, merged es in `options.abortSignal` des Tools — und `await`et dann schlicht das Tool. **Es gibt keinen Timer, der das `await` überholt.** Ein Tool, das das Signal nie liest, läuft unbegrenzt weiter.

Bei uns liest es **keines**: keine einzige `execute`-Implementierung in `agents/searchTools.ts`, `agents/domainTools.ts` und den übrigen Katalogen deklariert überhaupt den zweiten `options`-Parameter. Der Tausch wäre ein stiller No-op gewesen, der die einzige harte Schranke gegen einen hängenden Tool-Aufruf entfernt.

Zweitens ist die **Platzierung** load-bearing, unabhängig von der Erzwingungsfrage: Die Ablehnung wird im Wrapper zu `{ error }`, und genau das lässt einen Timeout als Fehlschlag zählen (`noteFailure` → `MAX_FAILURES_PER_TOOL`), den Schritt via `recordStep` persistieren und die Tool-Karte via `sendResult` schließen. Ein Abbruch von außen überspränge alle drei — die Karte im UI drehte sich für immer weiter.

**Verallgemeinerung:** Bei SDK-Fähigkeiten, die einen Eigenbau ersetzen sollen, ist die Frage nie „gibt es die Option?", sondern „erzwingt sie dasselbe, und an derselben Stelle?". Die Optionsliste in §4.2 ist eine Kandidatenliste, kein Auftrag.

### 4.5 `chunkMs` statt `createIdleDeadline` — Vorfrage beantwortet, Ergebnis trotzdem: nein

Die offene Vorfrage lautete: **zählt ein Reasoning-Delta als content chunk?** Davon hing ab, ob `chunkMs` unseren `createIdleDeadline` ersetzen kann — unsere ganze Idle-Erkennung beruht darauf, dass ein denkendes Modell als lebendig gilt.

**Die Antwort ist ja.** In `ai@7.0.37` (`node_modules/ai/dist/index.js:8509`) entscheidet `isOutputChunk2`, was den Chunk-Timer zurücksetzt, und dort steht `case 'reasoning-delta': return chunk.text.length > 0`. Ein nicht-leeres Reasoning-Delta ist ein Output-Chunk und rearmt das Fenster — genau unsere Semantik.

**Trotzdem nicht tauschen**, aus einem Grund, der erst beim Vergleich der beiden Aufrufstellen sichtbar wird:

| Pfad | Politik | `chunkMs`? |
|---|---|---|
| Loop-Synth (`loopEngine.ts:516`) | rearmt auf allem, bewacht den ganzen Stream | **exakte Entsprechung** |
| Single-Pass (`responseStreamingService.ts:438-476`) | rearmt auf Reasoning, **entwaffnet** (`clear()`) beim ersten sichtbaren Text-Delta | **nein** — `chunkMs` kennt kein Entwaffnen |

Das Entwaffnen ist dort Absicht und ausdrücklich kommentiert: solange dem Nutzer noch nichts angezeigt wurde, ist ein sauberer Lane-Fallback möglich; danach nicht mehr. `chunkMs` bewachte auch Phase 2 weiter und nähme dem Pfad diese Unterscheidung.

Damit bliebe nur der Loop-Pfad tauschbar — und `streamIdleDeadline.ts` existiert laut eigenem Kopfkommentar genau deshalb, weil beide Pfade **eine** Definition von „hängt" teilen sollen. Einen der zwei Aufrufer auf einen SDK-Mechanismus umzustellen hieße: Modul behalten **und** zweiten Mechanismus dazu — wieder zwei Definitionen, also das Gegenteil des Zwecks.

Nebenbei geklärt und für später notiert: der Fehler *wäre* unterscheidbar. Ein Chunk-Timeout bricht mit einer `DOMException` namens `TimeoutError` und der Nachricht `"Chunk timeout of Nms exceeded"` ab (`setAbortTimeout`, `dist/index.js:2743`) — `runPassWithFallback` könnte ihn also von einem Nutzer-Abbruch trennen, allerdings über `name`/Nachricht statt über einen eigenen Typ.

### 4.6 SSE-Emission aus dem Tool-Wrapper lösen — geprüft und verworfen

Der Plan sah vor, `sendResult` und `recordStep` aus `wrapTools.ts` in einen `onToolExecutionEnd`-Hook zu verschieben (`sendStart` musste ohnehin bleiben, weil die Karte *vor* dem bis zu 30 s langen Ergebnis erscheinen soll).

**Der Hook bekommt unseren Zustand nicht.** `ToolExecutionEndEvent` trägt ausschließlich `toolCall`, `toolContext` und `toolOutput` (`ai@7.0.37`, `dist/index.d.ts:3165`). `recordStep` braucht aber `textOffset` (beim **Start** genommen), die gedrainte `narration` (ebenfalls beim Start, „erster von parallelen Geschwistern gewinnt") und `serverMeta`. Der Umbau bräuchte also eine Seitentabelle `Map<toolCallId, …>`, im Wrapper geschrieben und im Hook gelesen — plus ein Leck für jeden Call, der nie endet.

**Bilanz:** Der Wrapper bliebe für Guards, `sendStart`, Offset-Erfassung, Narration, Timeout und Truncation bestehen; zwei von sechs Belangen zögen um und brauchten dafür geteilten Zustand zwischen zwei Stellen. Das ist **mehr** Kopplung, nicht weniger, ohne sichtbaren Gewinn — und das an der am stärksten tragenden Stelle des Chats.

---

## 5. Bewertung: MCP

### 5.1 Unser Client bleibt

`apps/api/services/mcp/UserMCPClient.ts` umhüllt den offiziellen `@modelcontextprotocol/sdk`-Client direkt und verdient seinen Platz: SSRF-Revalidierung bei **jedem** Connect (`validateUrlForFetch`), Connect-/Call-Timeouts, Extraktion von `structuredContent`/`_meta`/Embedded-Resources für die MCP-Apps-Widgets, Call-Serialisierung pro Client. `mcpCatalog.ts:168-180` übersetzt jedes Tool in ein `dynamicTool` mit `jsonSchema(sanitizeMcpSchema(...))`, namensraumiert als `m<serverId8>__<tool>`, gedeckelt bei `MAX_TOOLS = 60`.

Ein Wechsel auf `createMCPClient` aus `@ai-sdk/mcp` ist deshalb **kein** klarer Gewinn.

### 5.2 Was wir trotzdem übernehmen sollten

**`fingerprintTools` und `detectToolDrift` werden aus `ai` exportiert und arbeiten auf einem beliebigen `ToolSet`** — Rug-Pull-Erkennung ist also **ohne Client-Wechsel** adoptierbar. Wir erlauben nutzerverwaltete MCP-Server; eine nachträglich geänderte Tool-*Beschreibung* ist heute ein ungeprüfter Prompt-Injection-Vektor. Muster: Baseline bei der ersten (menschlich freigegebenen) Verbindung persistieren, bei jedem späteren `tools()`-Fetch diffen, bei `changed`/`added` **blockieren und zur Neufreigabe zwingen** statt still weiterreichen.

Grenze, die man mitdokumentieren muss: das erkennt Mutation von Beschreibung, Input-Schema und Titel — **nicht** einen Verhaltens-/Endpunkt-Tausch bei unverändertem Namen und Schema, weil das Tool remote läuft.

### 5.3 Was uns sonst fehlt

`maxRetries` für transiente `tools/call`-Fehler (wir haben `withRetry`, nur nicht dort verdrahtet — und Vorsicht: nicht-idempotente Tools dürfen nicht wiederholt werden) · Elicitation (`onElicitationRequest`) · `listResources`/`experimental_listPrompts`/`complete` · Session-Reattach. Nicht übernehmen: `outputSchema`-Typisierung (unsere Schemata kommen zur Laufzeit vom Nutzer-Server) und OAuth-`authProvider` (eigener Flow existiert, siehe `CLAUDE-mcp.md`).

---

## 6. Tiers

### Tier 1 — sofort, unabhängig von jeder offenen Frage

| Thema | Ort |
|---|---|
| Notebook-Tiefenmodus rerankt nicht | `routes/chat/notebookStreamCore.ts:192-214` |
| Notebooks haben **null** Eval-Abdeckung | `apps/api/evals/corpus/` |
| Mistral-Adapter baut `maxRetries` nach | `workers/providers/mistralAdapter.ts:280-404` |
| GreenPT-Reasoning geht verloren | `workers/providers/greenptAdapter.ts` |
| Dritte Kopie des Forced-Tool-Call-Musters | `routes/canvas/services/runCanvasSuggest.ts` |
| ~~Tool-Timeout handgebaut~~ — **geprüft und verworfen**, siehe §4.4 | `agenticLoop/wrapTools.ts` |
| Artefakte reparieren sich nicht selbst | `services/pdf/PdfGenerationService.ts:163` → `artifactKinds.ts:81-85` (`successText` teilt Mängel mit, repariert nicht) |

### Tier 2 — je eine Entscheidung dran

Toten Graph-Code löschen (§2.3) · MCP-Drift-Erkennung (§5.2) · ~~`chunkMs` statt `createIdleDeadline`~~ (geprüft und verworfen, §4.5) · Provider-Konstruktion vereinheitlichen (§7) · ~~SSE-Emission aus dem Tool-Wrapper lösen~~ (geprüft und verworfen, §4.6) · `ToolLoopAgent` als Retrieval-Subagent für den Notebook-Tiefenpfad.

### Tier 3 — bewusst entscheiden, nicht hineinschlittern

Statischer Tool-Katalog + `toolsContext` + `activeTools` · **`AIWorkerPool` zurückbauen** (größter Hebel) · eine Recherche-Maschine, ein Zitat-Schema · Deep-Agents-Pilot im Monitor (optionaler Datenpunkt, kein Adoptionsschritt) · natives `toolApproval` · `Output.object` (**erst nach einem Bump über 7.0.39**).

---

## 7. Bewusst NICHT — mit Begründung

- **Deep Agents als zweite Lane, als Loop-Ersatz oder als volles Harness.** Siehe §3.
- **Den SSE-Stack auf `createUIMessageStream` umbauen.** 34 Event-Typen, ein 1.367-Zeilen-Client-Parser, an assistant-ui gekoppelt, mit live gewachsener Interleaving-Logik. Das ist eine mehrwöchige Neuschreibung, kein Transport-Tausch. Vernünftige Variante: *neue* Event-Typen als `data-*`-Parts, kein Big Bang.
- **`generateStructured.ts` abschaffen.** ~~Gerechtfertigt, solange der `AIWorkerPool` steht.~~ **Entschieden am 16.08.2026 (Phase C/C2):** das Modul ist weg, seine Semantik nicht — sie lebt jetzt in `aiObject` (`services/ai/generate.ts`). Der Beleg aus dem C-Bericht bleibt gültig und war der Grund für genau diese Richtung: `validate` ist ein semantisches Gatter, dessen Meldung die Reparaturrunde treibt, und dafür hat weder `generateObject` (in ai@7.0.58 selbst deprecated) noch `Output.object()` noch `experimental_repairText` einen Slot. Zusammengelegt wurde also nicht die Semantik weg, sondern die zweite Form: `aiObject` und `generateStructured` implementierten dasselbe Muster nebeneinander, und der schwächere Zweitpfad (`parseText`) ließ in Produktion das Leerfolien-Gatter der Präsentation still ausfallen.
- **`runPassWithFallback` und `providerFallback.ts` ersetzen.** Kein SDK-Äquivalent, verifiziert.
- **`TokenCounter`/`CHARS_PER_TOKEN` ersetzen.** Das `ai`-Paket liefert keinen Tokenizer.
- **`withRetry`/`CircuitBreaker` ersetzen.** Werden auch für Nicht-LLM-Aufrufe genutzt (DB-Schreibvorgänge, SearXNG).
- **Provider-Quirk-`fetch`es entfernen.** Patches für Provider, die das erwartete Wire-Format verletzen.

**Bekannte Divergenz, die eine bewusste Entscheidung braucht statt eines Aufräumens:** `services/ai/providers.ts:91-96` wirft ohne `REGOLO_API_KEY`; `routes/chat/agents/providers.ts:438-443` fällt still auf Mistral zurück, ohne dass der Aufrufer es erfährt (dort auch `console.log` statt `createLogger`). Beim Vereinheitlichen **nicht** einfach eine Seite für alle wählen — den Unterschied in den Typ heben.

---

## 8. Phasenplan

| Phase | Was | Warum an dieser Stelle |
|---|---|---|
| **0** | Eval-Abdeckung: Notebooks (heute null) + die live reproduzierten Fehler aus `apps/api/evals/FINDINGS.md`, die nicht als Regression getrackt sind | Man kann nicht sicher umbauen, was man nicht misst. Alles darunter ist Umbau |
| **0** | Die **5 fehlschlagenden `safety-adversarial`-Szenarien** beheben | Prompt-Injection über eingefügten Text, erfundene Zitate mit Namensnennung realer Politiker\*innen, Gruppen-Diffamierung. Rangiert aus eigenem Recht vor allem anderen |
| **1** | Toten Ballast löschen (§2.3) | Kostenlos. Beseitigt falsche Signale darüber, was die Architektur ist |
| **2** | **Intent-Registry** — eine Quelle, generiert | Höchster struktureller Ertrag. Direkte Ursache von mindestens drei ausgelieferten Fehlern |
| **3** | `AIWorkerPool` zurückbauen | Ursache des zweiten Aufrufwegs. Löscht zugleich dessen Timeout-, Retry-, Nachrichtenformat- und Usage-Nachbauten |
| **4** | Eine Recherche-Maschine, ein Zitat-Schema; den Entitätsnamen-Fix portieren | Jetzt sicher, weil Phase 0 das Netz gespannt hat |
| **5** | Statischer Tool-Katalog + `toolsContext` + `activeTools` | Am besten nach Phase 3, damit Tools einmal gegen **eine** Runtime deklariert werden |
| **6** | Den Loop überdenken | Ab hier eine echte Wahl ohne Migrationskosten |

**Der Zielzustand:** ein Aufrufweg, eine Intent-Registry, eine Recherche-Maschine, ein Tool-Katalog, Evals über jeder Oberfläche. Dann ist der Loop austauschbar — und die Harness-Frage kostet eine Konfigurationsänderung statt eines Quartals.

**Ehrliche Kosten:** Phasen 2 und 3 sind die teuren (eine Registry über ~8 Dateien plus generierte Ausgabe; eine Migration über 106 Aufrufstellen). Keine davon liefert ein sichtbares Feature. Die kleinere, verteidigbare Variante ist **0 + 1 + 2** — das allein hätte drei der vier Fehler aus PR #2149 verhindert.

---

## 9. Zustand der Notebooks

**Notebooks funktionieren vollständig.** Echtes Chunking, Hybrid-Suche (vector 0.7 / text 0.3), Mistral-Embeddings, Ingestion aus manual/Wolke/WordPress, getestete fünfstufige Collection-Prioritätskette, Zugriffskontrolle. Die Empty-Result-UX ist überdurchschnittlich: `NotebookQAService.ts:1040-1088` unterscheidet „indiziert noch" / „Verarbeitung fehlgeschlagen" / „wirklich kein Treffer".

Drei Befunde trotzdem:

1. **„Tiefenrecherche" überspringt das Reranking, „Schnell" nicht** (`notebookStreamCore.ts:192-214`). Der Pfad mit den *meisten* Kandidaten (30–40, gegenüber 12 im normalen Chat nach Rerank) ist der einzige ohne Cross-Encoder — invers zum UI-Versprechen.
2. **Null Eval-Abdeckung.** Keines der 107 Korpus-Szenarien erwähnt Notebooks. Zusätzlich erreicht der Runner die Oberfläche gar nicht: er postet fest gegen `/api/chat-graph/stream`, Notebooks liegen auf `/api/chat-service/notebook/stream` mit eigenem Event-Vokabular.
3. **Wolke/Connect ist kein Retrieval.** `wolkeRetrieval.ts`/`connectRetrieval.ts` chunken nach 1.500 Zeichen und liefern die ersten N Chunks mit hartkodierter `relevance: 0.7` — eine relevante Stelle tief in einem langen Dokument ist unerreichbar.

Zusatzfalle: die Postgres-Tabellen `notebook_collections`/`notebook_collection_documents` werden **nirgends abgefragt** — der operative Store ist Qdrant (`NotebookQdrantHelper.ts`). Wer `schema.sql` als Wahrheit liest, irrt.

---

## 10. Methodische Hinweise für künftige Sitzungen

- **Gegen den Zielbranch auditieren, nicht gegen den ausgecheckten.** Ein früheres Audit lief gegen einen Feature-Branch; von zwölf geplanten PRs waren danach drei gegenstandslos, zwei „Bugs" nicht erreichbar und eine geplante Dedup schlicht falsch.
- **Explore-Agenten auf Falsifikation ansetzen, nicht auf Bestätigung.** Erst die Runde mit ausdrücklichem Widerlegungsauftrag brachte das echte Bild — und zwei vorher unbekannte echte Fehler.
- **Doku-Behauptungen gegen die Quelle prüfen.** In dieser Untersuchung wurde eine plausibel klingende, aber frei erfundene API (`compactWhen`/`hasMoreTokensThan` auf `ToolLoopAgent`) nur deshalb verworfen, weil ein Agent im Repository danach gegrept hat.
- **Ein Test, der nicht rot werden kann, zählt nicht.** Verhaltensfix ⇒ eigener Commit mit eigenem Test; die darauf aufsetzende Dedup erst danach. (`git stash` ist im Projekt verboten — für die Rot-Probe einen temporären Revert-Commit nutzen.)

---

## 11. Endstand des Sanierungsprogramms

**Der Phasenplan aus §8 ist abgearbeitet** (Phasen A–N, PRs #2677–#2717). Was oben als Bestandsaufnahme steht, beschreibt damit den Zustand VOR dem Programm; dieser Abschnitt hält fest, was heute gilt.

**Ein Aufrufweg zum Modell.** `services/ai/generate.ts` (`aiText`/`aiObject`/`aiTools` → `executeProvider`), geroutet über `AI_LANES`. Der zweite Weg ist gelöscht, nicht deprecated: `aiService.ts`, `AiClient`, `utils/getAiClient.ts` und `app.locals.aiClient` gibt es nicht mehr. Die letzte stille Umroutung — eine Prompt-Config, die per `options.model` die Tabelle übergeht — ist mit ihr entfallen; `promptConfigRouting.vitest.ts` bewacht das über alle Configs. Wer die Tabelle umgehen muss, sagt das mit `AiCall.pinned` im Code.

**Ein Turn-Entscheider.** `decideTurnPlan` (`routes/chat/services/agenticLoop/turnPlan.ts`) beantwortet „wie läuft dieser Turn, unter welchem Intent" in einer Funktion; `plan.intent` ist danach endgültig, niemand schreibt ihn nach. Vorher lag die Antwort auf drei Schichten, die sich gegenseitig korrigierten — und genau in den Nähten dazwischen sassen die letzten zwei Fehler des Programms (Pipeline-Zwang vs. System-Tool-Auffang; Loop-Schalter vs. `agentic_to_search`).

**Registry-Rollout.** `@gruenerator/shared/chat-intents` trägt die Intents samt Dispositions-Achse. Die Regel dabei ist eine Unterscheidung, keine Umzugsquote: was eine Eigenschaft des Intents ist, wird abgeleitet (`AGENTIC_INTENTS`, `NAMED_RETRIEVAL_INTENTS`, `NO_RETRIEVAL_VERDICTS`); was die Politik eines Konsumenten ist, bleibt bei ihm — typisiert und mit der gemessenen Abweichung im Kopfkommentar (`NON_SEARCH_INTENTS`, `DEMOTABLE_HEURISTIC_INTENTS`). `INTENT_HANDLER_PATHS` ist die erschöpfende Karte „welcher Zweig führt welches Verdikt aus"; ein neuer Intent bricht dort den Build.

**Die Monolithen.** `chatGraphContractRouter.ts` 2562 → 465 Z. (Stufen in `streamStages/`), `agenticRespondService.ts` 1845 → 591 Z., `intentExecutionService.ts` 1640 → 40 Z. (reine Fassade; Inhalt in `intentHandlers/`), `responseStage.ts` 559 → 240 Z. `classifierNode.ts` liegt weiter bei rund 1965 Z., aber ohne die 27k-Zeichen-LLM-Stufe: die Tiers entscheiden deterministisch, und die verbliebenen Modellaufrufe sind kleine, benannte Auflöser.

**Die Lane ist die Achse, an der die Ausführung hängt (Phase N).** `TurnLane` war bis dahin Dekoration — fünf Ausführungspfade, kein Konsument; gelesen wurde der Boolean `runAgentic`, und `edit-loop`/`compound-edit` waren ein drittes Mal dieselbe Aussage, weil `TurnPlan` `editToolLoop`/`compoundEdit` ohnehin als Felder führt. Heute trägt die Lane das Vokabular des Zielbilds (`greeting` / `produktion` / `pipeline` / `loop` / `single-pass`), `runAgentic` ist aus ihr abgeleitet, und die Zuordnung kommt aus der Registry (`dispositionOf`) statt aus Literalen.

**Die Erwähnungen sind von den Intents entkoppelt (K–N).** Eine `@`-Erwähnung zurrt heute ein WERKZEUG fest (`IntentMention.pinsTool`), ein REZEPT (`activatesSkill`) oder eine ARTEFAKTART (`ARTIFACT_CREATE_TOKENS`) — nicht mehr zwingend ein Verdikt. Das war der Grund, warum vorher kein Intent sterben konnte: eine Erwähnung hielt ihn am Leben, auch wenn er sonst nichts mehr steuerte.

**Getötete Verdikte.** Sieben von 41 Intents sind `retired` — nichts erzeugt sie mehr, und keine Erwähnung emittiert sie: `bahn`, `reise`, `hotel`, `wetter`, `news` (als verwaltete Konnektoren aus der Intent-Achse ausgezogen — Quellenwahl ist Montage und braucht kein Verdikt), `umfragen` (Werkzeug-Pin) und `pressemitteilung_examples` (Werkzeug-Pin **und** Rezept). Die Enum-Werte bleiben: `searchIntentSchema` ist F0, ausgelieferte Binaries lesen ihn weiter.

**Was der Klassifikator wirklich noch emittiert.** Über die 167 Turns des adversarialen Korpus fallen **13** verschiedene Verdikte, nicht 41 — und `agentic` allein trägt 107 davon (Tier-3.5-Demotion), `produktion` und `sharepic` je 18. Die Feinunterscheidung, die der Umbau angegriffen hat, leistet also messbar wenig Arbeit; der Zensus (`classifierCensus.baseline.txt`) misst das fortlaufend.

**Die Parlaments-Abrufe haben nur noch eine Tür (N).** `bundestag`/`abgeordnetenwatch` liefen bis 08/2026 doppelt: das Loop-Werkzeug rief `searchNode` mit gesetztem Intent erneut auf und nahm dessen ganze Vorrede mit — was einen echten Fehler verdeckte (`@bundestag` auf einem Turn mit zwei Dokumentquellen fragte die DIP nie). Seit Phase M/N gibt es einen gemeinsamen Kern und **nur** das Loop-Werkzeug; ein Turn, den ein Notausschalter aus der Schleife hält, weicht über `degradeTo` aus der Registry aus, statt still nichts zu tun. `forcedLane: 'loop'` bedeutet seitdem genau eine Sache: kein Einzeldurchlauf. Ein Wächter erzwingt, dass jeder Intent dieser Achse ein Ausweichziel deklariert (`mcp` ist die begründete Ausnahme).

**Was bewusst offen bleibt:** die kompilierten LangGraph-Graphen haben weiterhin null Aufrufer (§2), die Recherche-Maschinen sind nicht zu einer zusammengelegt (§8 Phase 4), und die Notebook-Befunde aus §9 sind unangetastet. Deep Agents bleibt abgelehnt (§3), das AI SDK v7 weiter der Hebel (§4).

**Die Recherche-Konsolidierung ist das benannte Restproblem — und der Grund, warum die Lane-Entscheidung noch NACH der Intent-Feinwahl fällt.** Das Zielbild sieht vier Lanes vor; es gibt eine fünfte, `single-pass`, und sie trägt die Recherche-Familie (`search`/`web`/`research`/`compare`/`examples`) samt der gegatterten Sonderwege (`summary`/`compute`/`chat_history`/`scrape_url`). Solange deren Executoren sich je Intent unterscheiden, MUSS der Intent vor der Lane feststehen. Wer die sechs Recherche-Maschinen zu einem Loop-Suchpfad zusammenlegt, nimmt damit zugleich die letzte Lane und dreht die Reihenfolge um. Zwei Messungen aus Phase K/L, die dabei nicht neu erhoben werden müssen: `summary` wird NICHT zum Rezept (`respondNode` unterdrückt Rezept und gelernte Textform absichtlich — eine Zusammenfassung trägt die Form ihrer Quelle), und `compare` auch nicht (Hochstufung und Degradierung brauchen die Trefferzahl zur Laufzeit).

### Governance: kein neuer Intent für eine neue Fähigkeit

Das Programm hat die Intent-Achse von 41 auf 13 tatsächlich emittierte Verdikte gedrückt, indem es Fähigkeiten verschoben hat, statt sie zu löschen. Diese Richtung hält nur, wenn die Standardantwort auf „wir brauchen etwas Neues" nicht wieder ein Intent ist:

**Eine neue Fähigkeit ist ein Werkzeug oder ein Rezept, plus ein Registry-Eintrag (plus, wenn sie adressierbar sein soll, eine Erwähnung).** Ein Werkzeug für etwas, das geholt oder getan wird; ein Rezept für etwas, das anders geschrieben wird; eine Erwähnung, damit die Person es benennen kann. Alle drei sind Daten, keine Verzweigung.

**Ein neuer Intent nur mit einem Verhaltensanker, der sich nicht ableiten lässt** — ein eigenes deterministisches Gitter VOR der Werkzeugwahl, eine eigene SSE-Stufe, ein Kontingent oder ein HITL-Vertrag, eine Statuszeile, die sonst niemand schreibt. Der Anker gehört in den PR, benannt und begründet. Fehlt er, ist der Intent eine Statuszeile mit Extraschritten: er kostet einen Eintrag in jeder totalen Karte (`DISPOSITION_BY_INTENT`, `FORCED_LANE_BY_INTENT`, `INTENT_HANDLER_PATHS`), einen Zweig im Klassifikator und ein Verdikt, das der Loop danach ohnehin überstimmt.

**Die Gegenprobe vor dem Merge:** Wäre die Fähigkeit auch erreichbar, wenn der Intent fehlte und stattdessen eine Erwähnung das Werkzeug festzurrte? Lautet die Antwort ja, gehört sie in den Loop.

---

## Verwandte Dokumente

- `documentation/docs/intern/chat-tool-loop-plan.md` — Entwurf des agentischen Tool-Loops
- `documentation/docs/intern/sharepic-chat-editing.md` — Entscheidungsdoku „strukturierter Call jetzt, Loop später"
- `CLAUDE-mcp.md` — MCP-Server v2, Scopes, Tool-Bridge
- `CLAUDE-routing.md` — Express-5-Typisierung, Worker-Pool-Zugriff
- `docs/typescript-safety-roadmap.md` — formales Vorbild für dieses Papier
