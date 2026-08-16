# Chat-Architektur: Bewertung und Sanierungsplan

**Stand 2026-08-16 · geprüft gegen `master @ 973a740d9`** (Grundfassung 2026-07-29 gegen `c64ddc53d`; §§1–10 tragen den Juli-Stand mit eingearbeiteten Korrekturen, §11 den August-Review)

Dieses Papier hält das Ergebnis von fünf Audit-Runden fest: Bewertung von LangChain **Deep Agents**, dem **Vercel AI SDK v7** und **MCP** als Grundlage für den Chat, dazu eine Bestandsaufnahme aller ~38 Intents, der Recherche-Pipelines und der Notebooks. Es ist als Referenz für künftige Sitzungen gedacht — die Analyse soll nicht in drei Monaten neu bezahlt werden.

Jede Architekturaussage ist mit `datei:zeile` belegt und wurde gegen den oben genannten Commit geprüft. Wo eine Aussage nicht verifiziert werden konnte, steht das ausdrücklich dabei.

> **Lesehinweis zum Alter der Abschnitte.** Zwischen Juli- und August-Stand liegen 2,5 Wochen und 464 Commits allein im Chat-Perimeter. Wo eine Juli-Aussage überholt ist, steht die Korrektur **an Ort und Stelle** (als „Nachtrag 2026-08-16"), nicht nur in §11 — eine Aussage, die man erst am Ende des Papiers widerrufen findet, hat vorher schon jemand gelesen und geglaubt.

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

> **Nachtrag 2026-08-16 — dieser Abschnitt ist historisch.** Der `worker_threads`-Pool ist am 29.07. gelöscht worden (`9456df6ee`), das Verzeichnis `apps/api/workers/` existiert nicht mehr, `aiWorkerPool` kommt repoweit **null**mal vor. An seiner Stelle steht `services/ai/aiService.ts` als **In-Process-Fassade**, seit `0810e0714` unter `app.locals.aiClient` (nicht mehr `aiWorkerPool` — wer den alten Namen sucht, auch in `CLAUDE.md`, findet nichts). Der Umbau hat die Zwei-Wege-Lage aber **nicht** aufgelöst, sondern verschoben: siehe §11.4. Der Abschnitt bleibt stehen, weil §7 und §8 auf ihn verweisen.

| Weg | Wo | Umfang |
|---|---|---|
| Direkt über das AI SDK | `agenticLoop/loopEngine.ts`, `routes/docs/aiController.ts`, `services/userAgents/agentDraftService.ts` | — |
| `AIWorkerPool` (`worker_threads`-RPC) — **seit 29.07. entfernt** | ~~`apps/api/workers/aiWorkerPool.ts` + `workers/providers/*Adapter.ts`~~ | ~2.300 Zeilen, **106 Aufrufstellen** |

Der Pool rief in seinen Adaptern selbst wieder `generateText` aus `ai` auf und übersetzte das Ergebnis zurück in eine Anthropic-förmige Struktur. Für I/O-gebundene HTTP-Aufrufe kauft `worker_threads` keine Nebenläufigkeit, die `async`/`await` nicht schon hätte — die Worker *verteilten*, sie lagerten keine CPU-Arbeit aus.

**Das war die Ursache mehrerer anderer Eigenbauten:** `services/ai/generateStructured.ts` existiert laut eigenem Kopfkommentar, weil der Pool kein Constrained Decoding kann. Auf dem direkten Pfad wäre das `generateObject`. Der Gegenbeweis steht im selben Repo: `agentDraftService.ts` erledigt dieselbe Aufgabe in 130 Zeilen ohne Pool.

**Was der Pool hinterlassen hat, ist der Umschlag.** `AiClient.processRequest` nimmt weiterhin ein untypisiertes `{type, options}`-Paket und gibt `{content, success, …}` zurück — die Form, die einmal über eine `postMessage`-Grenze musste. Die Grenze ist weg, das Paket nicht: **66 Aufrufstellen** packen und entpacken es noch. `services/ai/generate.ts` ist die benannte Ablösung (`aiText`/`aiObject`/`aiTools`, laut Kopfkommentar über dieselbe Engine) — **mit null Produktionsnutzern** (Stand 16.08., einziger Importeur ist der eigene Test).

### 2.2 Vier Recherche-Maschinen

| # | Implementierung | Lebender Aufrufer |
|---|---|---|
| 1 | `routes/chat/agents/researchOrchestrator.ts` (1139 Z.) | **nur** `services/monitor/HotTopicPipeline.ts:164` (Tagesbriefing) |
| 2 | Linkup-Stufen im agentischen Loop (`services/search/searchDepth.ts`, `agenticLoop/sourceRegistry.ts`) | **die lebende Chat-Recherche** |
| 3 | `agents/langgraph/SearchGraph/` | `/api/search-graph` — ruft die **Nodes einzeln** auf, nicht den Graphen |
| 4 | `agents/langgraph/WebSearchGraph/` | `runWebSearch()` für `/api/search`; zusätzlich node-weise nachgebaut in `searchStreamController.ts` und `deepResearchNodeLegacy` |

Der Chat hat die Recherche mit PR #2137 auf die Websuche-Stufen umgestellt; das `research`-Tool wurde aus `searchTools.ts:257-263` entfernt, der Intent fällt in `searchNode.ts:1359-1360` in den `web`-Zweig. `researchOrchestrator.ts` ist damit aus dem interaktiven Chat heraus — wer ihn „ersetzen" will, verbessert einen Batch-Job.

### 2.3 Tote kompilierte Graphen

`chatGraph.invoke()` und `runSearchGraph()` hatten **repoweit null Produktionsaufrufer**. Die Router rufen stattdessen die einzelnen Node-Funktionen von Hand in Reihe (`intentExecutionService.ts`, `chatGraphContractRouter.ts`, zusammen ~4.200 Zeilen imperative Verzweigung — Juli: ~3.500).

**Beleg dafür, dass der Graph nie lief:** `ChatStateAnnotation` in `ChatGraph.ts` war gegenüber dem lebenden `ChatGraphState` um ~25 Felder zurückgeblieben. Liefe der Graph, verlöre er sie bei jedem Übergang.

> **Nachtrag 2026-08-16 — erledigt.** PR #2152 (`8962780ba`, „toten graph-code entfernen") hat Annotation, Routing-Funktionen und `llmConfig.ts`s `getAgentLLM`/`createReactAgent` gelöscht: **−1.505 Zeilen** über 10 Dateien, inklusive einer Abhängigkeit aus `apps/api/package.json`. `ChatGraph.ts` und `SearchGraph.ts` bestehen als Datei fort, tragen aber nur noch den Kopfkommentar, der die Geschichte festhält.

**Korrektur 2026-08-16 zu `searchContractRouter.ts`:** Die Juli-Fassung führte `apps/api/routes/search/searchContractRouter.ts` in derselben Aufzählung wie den toten Graph-Code. Das war falsch eingeordnet. Zutreffend ist nur die halbe Aussage: er ist **nicht gemountet** und hat außer sich selbst keinen Importeur. Er ist aber kein Rückstand, sondern ein **vorbereiteter Ersatz für den lebenden Pfad** — sein Handler lädt und ruft `runWebSearch()` (`searchContractRouter.ts:118,137`), also genau die Maschine hinter `/api/search`. Warum er wartet, steht am Mount-Punkt (`routes.ts:951-953`): der Pilotvertrag modelliert den SSE-Modus `?stream=true` nicht, von dem das Frontend abhängt. Löschen wäre der falsche Zug; die Aufgabe heißt „Streaming in den Vertrag heben".

> Wer „wir sind ein LangGraph-Projekt" annimmt, liegt für den Chat-Pfad falsch. Live ist LangGraph in fünf *anderen* Graphen (`FlyerToSiteGraph`, `AntragAgentGraph`, `SocialAgentGraph`, `ImageSelectionGraph`, `WebSearchGraph`).

### 2.4 Drei Unterfragen-Planer, zwei Zitat-Syntaxen

Planer: `researchOrchestrator.planResearchDeep` · `SearchGraph/nodes/queryPlannerNode.ts` · `WebSearchGraph/nodes/PlannerNode.ts`. **Nur der erste** weist die LLM an, den Entitätsnamen in jede Unterfrage zu tragen — der dokumentierte Fix, nachdem „Mona Neubauer / Herkunft" zufällige Bachelorarbeiten zurückgab. Der Fix wurde nie portiert.

> **Nachtrag 2026-08-16:** unverändert wahr, und um eine Maschine plus eine Nummerierungsquelle gewachsen — §11.5.

Zitate: `[N]` positional-append im `agenticLoop/sourceRegistry.ts` (stabil über Tool-Calls) · `[N]` pro Call neu nummeriert im `researchOrchestrator` · `[cite:N]` in `SearchGraph` und den Exportern. `HotTopicPipeline.ts:281-285` muss `applyCiteMarkers` laufen lassen, damit der Frontend-Renderer überhaupt etwas anzeigt. Genau diese Kollision ist der Grund, warum `research` nie in `AGENTIC_INTENTS` durfte — dokumentiert in `agenticLoop/agenticRespondService.ts:74-79`.

### 2.5 Intents in acht Kopien

35 Intents leben in `searchIntentSchema` (contracts), `intentToToolKey`, der Prompt-Prosa, der Prompt-JSON-Zeile, `NON_SEARCH_INTENTS`, der `INTENT_KEYWORDS`-Exclude-Liste, `INTENT_MESSAGE_POOLS`, `AGENTIC_INTENTS`, `DEMOTABLE_HEURISTIC_INTENTS` und einer Test-Liste. **Beim Hinzufügen eines Intents brechen nur drei davon den Build.** Genau diese Asymmetrie war die Ursache des `create_sheet`- und des `create_recurring_task`-Bugs. Details und ein ausgearbeiteter 7-PR-Entwurf: siehe die Memory-Notiz `chat-dedup-audit-2026-07`.

> **Nachtrag 2026-08-16:** Die Registry existiert inzwischen (`packages/shared/src/chat-intents/`), fünf der Kopien sind abgeleitet, fünf sind noch Handarbeit — Stand und Restliste in §11.3.

### 2.6 Der Loop ist live, nicht experimentell

`agenticLoop/flags.ts:13` liest `CHAT_AGENT_LOOP !== 'false'` — **Default an**, Opt-out. Zwei Modi in `loopEngine.ts` (647 Z.): `unified` (Mistral treibt Tools und schreibt) und `split` (fester schneller Planer sammelt Belege, das gewählte Modell schreibt einmal darüber). Budget in `agenticLoop/types.ts:107-114`: `maxSteps` 8, `wallClockMs` 120 s (weich), `hardCapMs` 300 s (hart), `perCallTimeoutMs` 20 s.

Guards in `agenticLoop/loopGuards.ts`: `MAX_FAILURES_PER_TOOL` 2, `MAX_TOTAL_FAILURES` 5, `MAX_SEARCH_CALLS` 6, `MAX_SOURCES` 20, `NEAR_DUPLICATE_JACCARD` 0.6, `MIN_INTERNAL_SOURCES_TO_SKIP_WEB` 3. Alle sind **Closures pro Turn** — sie kennen keine Subagenten.

---

## 3. Bewertung: Deep Agents

**Ergebnis (Juli): nicht als Chat-Loop übernehmen.** — **Ausgang (August): als gescopte zweite Runtime für Deep Research eingezogen.** Beides gilt; die Begründung unten ist der Grund, warum die Grenze genau dort liegt.

> **Nachtrag 2026-08-16.** `apps/api/package.json:111` führt `deepagents ^1.12.2`, und `apps/api/services/research/deepAgent/` ist ein echtes deepagents-Harness: 36 Dateien, ~5.900 Zeilen (davon die Hälfte Tests), `index.ts:15` importiert `createDeepAgent`, dazu `todoListMiddleware` aus `langchain`.
>
> **Das widerspricht der Bewertung nicht, es respektiert sie.** Der Blocker unten ist die fehlende Brücke zwischen dem `tool()`-Protokoll des AI SDK und LangGraph — er trifft jeden Umbau, der *bestehende* Tools in die neue Runtime tragen müsste. Der Deep-Research-Agent umgeht ihn, indem er **eigene** Werkzeuge mitbringt (drei, LangChain-nativ) und gar nicht erst übersetzt. Der Kopfkommentar von `services/research/deepAgent/index.ts:1-11` sagt genau das und nennt es „deliberate and scoped".
>
> Zu bezahlen ist trotzdem etwas, und es steht in §11.5: die zweite Runtime ist zugleich die **fünfte und sechste Recherche-Maschine**, und der Aufruf teilt sich ein Redis-Kontingent mit der alten (§11.6). Die Regel, die daraus folgt: **eine zweite Runtime ist tragbar, solange sie ihre Werkzeuge selbst mitbringt und an genau einer Stelle betreten wird.** Sobald ein Tool aus dem Chat-Katalog dort auftauchen soll, gilt wieder die Bewertung unten.

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
| ~~Mistral-Adapter baut `maxRetries` nach~~ — **mit dem Pool entfallen** (§2.1) | ~~`workers/providers/mistralAdapter.ts:280-404`~~ |
| ~~GreenPT-Reasoning geht verloren~~ — **anders gelöst:** Denken wird auf dem SDK-Pfad abgeschaltet, statt es zu retten; Begründung im Kopfkommentar | `services/ai/greenptThinkingFetch.ts:3-14` |
| Dritte Kopie des Forced-Tool-Call-Musters | `routes/canvas/services/runCanvasSuggest.ts` |
| ~~Tool-Timeout handgebaut~~ — **geprüft und verworfen**, siehe §4.4 | `agenticLoop/wrapTools.ts` |
| Artefakte reparieren sich nicht selbst | `services/pdf/PdfGenerationService.ts:163` → `artifactKinds.ts:81-85` (`successText` teilt Mängel mit, repariert nicht) |

### Tier 2 — je eine Entscheidung dran

~~Toten Graph-Code löschen~~ (**erledigt**, PR #2152, §2.3) · MCP-Drift-Erkennung (§5.2) · ~~`chunkMs` statt `createIdleDeadline`~~ (geprüft und verworfen, §4.5) · Provider-Konstruktion vereinheitlichen (§7) · ~~SSE-Emission aus dem Tool-Wrapper lösen~~ (geprüft und verworfen, §4.6) · `ToolLoopAgent` als Retrieval-Subagent für den Notebook-Tiefenpfad.

### Tier 3 — bewusst entscheiden, nicht hineinschlittern

Statischer Tool-Katalog + `toolsContext` + `activeTools` · ~~**`AIWorkerPool` zurückbauen** (größter Hebel)~~ → **halb erledigt:** der Pool ist weg, sein Umschlag lebt in 66 Aufrufstellen weiter (§2.1, §11.4) · eine Recherche-Maschine, ein Zitat-Schema (inzwischen **sechs** Maschinen, §11.5) · ~~Deep-Agents-Pilot im Monitor~~ → **anders ausgegangen:** Pilot in der Deep-Recherche statt im Monitor (§3) · natives `toolApproval` · `Output.object` (**erst nach einem Bump über 7.0.39**).

---

## 7. Bewusst NICHT — mit Begründung

- **Deep Agents als zweite Lane, als Loop-Ersatz oder als volles Harness.** Siehe §3.
- **Den SSE-Stack auf `createUIMessageStream` umbauen.** 34 Event-Typen, ein 1.367-Zeilen-Client-Parser, an assistant-ui gekoppelt, mit live gewachsener Interleaving-Logik. Das ist eine mehrwöchige Neuschreibung, kein Transport-Tausch. Vernünftige Variante: *neue* Event-Typen als `data-*`-Parts, kein Big Bang.
- **`generateStructured.ts` abschaffen.** ~~Gerechtfertigt, solange der `AIWorkerPool` steht.~~ **Die Begründung ist seit 29.07. gegenstandslos** — der Pool ist weg (§2.1), also auch das „der Pool kann kein Constrained Decoding". Damit ist die Frage nicht beantwortet, sondern zum ersten Mal offen: `generateStructured.ts` steht heute neben `services/ai/generate.ts`s `aiObject`, das dieselbe Aufgabe benannt erledigt. **Die Entscheidung fällt zusammen mit der Frage „ein LLM-Aufrufweg" (§11.4) und nicht davor** — sie einzeln zu treffen hieße, sich auf eine der beiden Fassaden festzulegen, bevor feststeht, welche bleibt.
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
| **1** ✅ | Toten Ballast löschen (§2.3) | Kostenlos. Beseitigt falsche Signale darüber, was die Architektur ist — **erledigt** (PR #2152) |
| **2** ◐ | **Intent-Registry** — eine Quelle, generiert | Höchster struktureller Ertrag. Direkte Ursache von mindestens drei ausgelieferten Fehlern — **~40 % ausgerollt**, §11.3 |
| **3** ◐ | `AIWorkerPool` zurückbauen | Ursache des zweiten Aufrufwegs. Löscht zugleich dessen Timeout-, Retry-, Nachrichtenformat- und Usage-Nachbauten — **Pool weg, Umschlag steht**, §11.4 |
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

## 11. Review 2026-08-16

Nachmessung 2,5 Wochen nach der Grundfassung, geprüft gegen `master @ 973a740d9`.

**Perimeter aller Zahlen in diesem Abschnitt:** `apps/api/routes/chat` + `apps/api/agents/langgraph/ChatGraph`, `.ts`-Dateien, `git ls-tree` gegen den jeweiligen Commit. „Test" heißt `*.vitest.ts`, `*.test.ts`, `*manual-test.ts` sowie alles unter `__integration__/`, `__tests__/`, `evals/`. Wer die Zahlen nachrechnet und andere bekommt, prüft zuerst den Perimeter: ein weiterer Zuschnitt derselben Messung (zusätzlich `services/chat/` und `evals/`) lag rund 9 % höher. Die Wachstumsrate war in beiden Zuschnitten dieselbe.

### 11.1 Volumen: +40 % in 2,5 Wochen, ohne eine einzige Zerlegung

| | 2026-07-29 (`c64ddc53d`) | 2026-08-16 (`973a740d9`) | Δ |
|---|---|---|---|
| Dateien gesamt | 234 | 336 | **+44 %** |
| Zeilen gesamt | 64.013 | 89.837 | **+40 %** |
| davon Produktion | 132 Dateien / 42.305 Z. | 162 / 54.610 | +29 % Z. |
| davon Tests | 102 Dateien / 21.708 Z. | 174 / 35.227 | +62 % Z. |

464 Commits im Perimeter. **Das Testwachstum überholt das Produktionswachstum** — die Abdeckung ist nicht das Problem.

### 11.2 Die Monolithen sind alle gewachsen, keiner wurde zerlegt

| Datei | Z. | Δ seit 29.07. | Eigene Testdatei |
|---|---|---|---|
| `routes/chat/chatGraphContractRouter.ts` | 2.562 | +402 | — (nur `__integration__/`) |
| `agents/langgraph/ChatGraph/nodes/classifierNode.ts` | 1.967 | +370 | ja, mehrere |
| `routes/chat/services/agenticLoop/agenticRespondService.ts` | 1.845 | +669 | **keine** |
| `agents/langgraph/ChatGraph/nodes/searchNode.ts` | 1.821 | +164 | ja |
| `agents/langgraph/ChatGraph/nodes/respondNode.ts` | 1.777 | +571 | ja |
| `routes/chat/services/intentExecutionService.ts` | 1.640 | +329 | **keine** |

Der Router führt seine Stufen als **Kommentarblöcke** statt als benannte Funktionen: `// === Stage 1: Classify ===` (:321), `// === Stage 2 + 3 ===` (:1892), Stage 2 (:2012), Stage 3 (:2031), 3b/3b′/3c/3d (:2306–2385), Stage 4/4b/4c (:2412–2456). Eine Struktur, die nur im Kommentar existiert, kann weder einzeln getestet noch einzeln ersetzt werden.

Die beiden Dateien **ohne eigene Testdatei** — `agenticRespondService.ts` (der am schnellsten wachsende Baustein überhaupt, +669 Z.) und `intentExecutionService.ts` — sind zugleich die, an denen jede Verhaltensänderung des Chats vorbeikommt.

### 11.3 Bereits saniert — die Positivliste

Die Juli-Diagnose „alles doppelt" ist an mehreren Stellen abgearbeitet worden, und zwar sauber:

- **Die LLM-Klassifikationsstufe ist gelöscht** (31.07., `68ffc1b8b`): mit ihr fielen der 27k-Zeichen-Prompt, der JSON-Parser, die dreistufige Malformed-Recovery und die Accept-Liste, die mit der Enum-Zeile des Prompts synchron gehalten werden musste — genau der Mechanismus hinter dem `create_recurring_task`-Bug. Ein Wächter hält die Größe: `apps/api/evals/classifierPromptBudget.vitest.ts`. `classifierParsing.ts` heißt heute `classifierSignals.ts` und „redet nie mit einem Modell" (Kopfkommentar).
- **Phantom-Tools raus, Antwortformat mit einem Eigentümer** (`5c72f0298`): `respondNode.buildAnswerFormatRule` (`respondNode.ts:1324`) ist die einzige Stelle, die eine Formatregel in den Turn schreibt, gepinnt von `answerFormatOwner.vitest.ts`.
- **Toter Graph-Code gelöscht**, −1.505 Z. (PR #2152) — siehe §2.3.
- **Provider-Konstruktion vereinheitlicht** (`services/ai/providerInstances.ts`), und die Regolo-Divergenz ist genau so behandelt worden, wie §7 es verlangt hat: nicht wegvereinheitlicht, sondern **sichtbar gemacht** — Kommentar plus WARN plus `lastFallbackProvider` in `routes/chat/agents/providers.ts:542-554`, mit der Anweisung „Do NOT clean this up by picking one side".
- **Der `worker_threads`-Pool ist weg** (§2.1).

**Die Intent-Registry existiert und ist zu rund 40 % ausgerollt.** Quelle ist `packages/shared/src/chat-intents/` (`CHAT_INTENTS` + die Dispositions-Achse in `dispositions.ts`).

*Abgeleitet* — ein neuer Intent landet automatisch richtig:

| Menge | Ort | Wie abgeleitet |
|---|---|---|
| `INTENT_TO_TOOL` (API) | `services/postResponseService.ts:74` | `intentToolNames().persist` |
| `INTENT_TO_TOOL` (UI) | `packages/chat/src/lib/toolMappings.ts:26` | `intentToolNames().ui` |
| `AGENTIC_INTENTS` | `agenticLoop/agenticRespondService.ts:164` | `intentsWithDisposition('loop')` + 4 Zusätze |
| `NAMED_RETRIEVAL_INTENTS` | ebd. :178 | `loop` minus `agentic` (Auffangwert darf nicht zwingen) |
| `NO_RETRIEVAL_VERDICTS` | `nodes/classifierSignals.ts:129` | `intentsWithDisposition('prose')` |
| Test-`ALL_INTENTS` | `intentPipeline.vitest.ts:52`, `autoPolicy.vitest.ts:11` | `searchIntentSchema.options` |

*Noch Handkopie* — hier bricht das Hinzufügen eines Intents nichts:

`NON_SEARCH_INTENTS` (`classifierSignals.ts:22`) · `INTENT_KEYWORDS` (`classifierHeuristics.ts:152`) · `INTENT_MESSAGE_POOLS` (`sseHelpers.ts:367`) · `DEMOTABLE_HEURISTIC_INTENTS` (`classifierNode.ts:105`) · `CONTROLLER_HANDLED_INTENTS` (`intentPipeline.vitest.ts:282`).

Dazu **mindestens neun verstreute Teilmengen**, jede für sich plausibel, zusammen die eigentliche Streuung: `EXTERNAL_RESEARCH_INTENTS` (`respondNode.ts:1301`), `INTENTS_WITH_OWN_FORMAT` (:1317), `COMPARE_UPGRADEABLE` (`classifierNode.ts:193`), `GENERATION_FUZZY_INTENTS` (`classifierHeuristics.ts:43`), `HINT_OVERRIDABLE` (`autoPolicy.ts:259`), `COMPOUND_GENERATION_INTENTS` (`agenticLoop/routing.ts:342`), `CLARIFICATION_UPGRADE_INTENTS` (`resumePipeline.ts:81`), `SYSTEM_TOOL_INTENTS` (`services/mcp/systemMcpServers.ts:258`), `UNSUPPORTED_INTENTS` (`services/boards/boardAgentWorker.ts:69`), `ARTIFACT_KIND_BY_INTENT` (`evals/classifierCensusHarness.ts:78`).

> **Präzisierung zu `CONTROLLER_HANDLED_INTENTS`:** Der Typschutz eines `Record<SearchIntent, …>` in einer `.vitest.ts` ist tatsächlich wirkungslos — `apps/api/tsconfig.json:25-31` schließt Testdateien aus, `pnpm typecheck` sieht sie nie, und der Kommentar dort hält fest, dass genau so „eine unvollständige Intent-Karte in dem Test saß, der unvollständige Intent-Karten fangen sollte". **Ersatzlos ist die Lücke aber nicht:** die Karte wird zur Laufzeit über `ALL_INTENTS` geschleift (`intentPipeline.vitest.ts:348-355`), und `scripts/check-unenforced-exhaustive-maps.mjs` bricht die CI (`ci.yml:109`), wenn eine solche Karte diese Schleife *nicht* hat. Der Schutz ist also verlagert, nicht verloren — er greift beim Testlauf statt beim Compile.

### 11.4 LLM-Aufrufwege: aus zwei wurden drei

Der Rückbau des Pools hat den zweiten Weg nicht entfernt, sondern einen dritten erzeugt, weil die Ablösung gebaut, aber nicht bezogen wurde:

| Weg | Umfang (16.08.) |
|---|---|
| Direkt über das AI SDK | **37 Dateien** in `apps/api` rufen `generateText`/`streamText`/`generateObject`/`streamObject` |
| `AiClient.processRequest` (der Pool-Umschlag ohne Pool) | **66 Aufrufstellen**; ein Konstruktionspunkt (`server.ts:251`), erreichbar als `app.locals.aiClient` |
| `services/ai/generate.ts` (`aiText`/`aiObject`/`aiTools`) | **0 Produktionsnutzer** — einziger Importeur ist der eigene Test |

Das ist der teuerste Einzelbefund dieses Reviews, und er ist ein Muster, kein Versehen: **eine Fassade, die niemand bezieht, ist kein Fortschritt, sondern ein dritter Weg.** Ihr Kopfkommentar begründet ausdrücklich, warum der Umzug mechanisch und risikoarm wäre (identischer Code-Pfad, „die alte und die neue Fassade können nicht driften, solange beide existieren") — genau diese Eigenschaft verfällt mit der Zeit, weil sie niemand prüft. Die Konsequenz für die Planung: **Migration der Aufrufstellen gehört in denselben PR wie die Fassade, oder die Fassade wartet.**

### 11.5 Recherche: aus vier Maschinen wurden sechs

Neu seit Juli: `routes/chat/services/deepResearchTurn.ts` (233 Z., Linkup-basiert) und `services/research/deepAgent/` (36 Dateien, deepagents-Harness, §3). Die vier aus §2.2 bestehen unverändert fort.

Unverändert offen bleiben damit auch die Juli-Befunde: **drei Unterfragen-Planer** (`researchOrchestrator.planResearchDeep:238`, `SearchGraph/nodes/queryPlannerNode.ts`, `WebSearchGraph/nodes/PlannerNode.ts`), der **Entitätsnamen-Fix weiterhin nur im ersten**, und die beiden Zitat-Syntaxen `[N]`/`[cite:N]` — jetzt plus einer **dritten Nummerierungsquelle** in `deepResearchTurn.ts` (Linkup nummeriert selbst).

### 11.6 Verhaltensbefunde

- **Deep-Research-Kontingent: zwei Grenzen auf einem Redis-Schlüssel.** `deepAgentTurn.ts:50` setzt `DAILY_LIMIT = 3`, `deepResearchTurn.ts:51` nimmt den Vorgabewert 1 desselben `DeepResearchCounter`. **Das ist Absicht und dokumentiert** (`deepAgentTurn.ts:45-49` begründet die 3 mit den Kosten, :78-86 die Folgen), inklusive Abhilfe: ist das Agentenkontingent erschöpft, steht der Zähler bei ≥3 und damit über der 1 des Geschwisters — der Turn endet deshalb als `quota_spent` statt als `not_served`, damit nicht eine zweite Warnung mit einer *anderen* Zahl widerspricht. **Der Befund ist also kein Fehler, sondern eine Kopplung mit Verfallsdatum:** zwei Zahlen an zwei Orten, deren Verhältnis (3 > 1) load-bearing ist und die nichts zusammenhält. Wer eine davon anfasst, muss die andere kennen.
- **`jaccard` existiert zweimal und ist auseinandergelaufen.** `agenticLoop/loopGuards.ts:237` rechnet mit Containment-Term, `agents/researchOrchestrator.ts:905` ohne. Zwei Ähnlichkeitsbegriffe unter einem Namen; welcher „richtig" ist, entscheidet die jeweilige Schwelle, die auf ihn geeicht wurde. (Ein dritter, ehrlich benannter, steht in `services/search/DiversityReranker.ts:44` als `jaccardSimilarity` — der ist kein Duplikat, sondern ein anderer Zweck.)

> **Zurückgezogen: die `AiProviderError`-Regression.** Ein früherer Entwurf dieses Abschnitts führte „jeder Provider-Fehler erreicht den Client als nacktes `internal`" als offenen Befund mit Beleg `aiService.ts:39-45`. **Das ist falsch.** Die Stelle ist ein *Kommentar*, der die Regression **historisch** beschreibt; behoben wurde sie am 29.07. mit `5a8759535` („provider-fehler wieder klassifizieren"), und der Code direkt darunter (`aiService.ts:45-52`) konstruiert den `AiProviderError`. Wert der Beobachtung über den Einzelfall hinaus: **ein Kommentar im Perfekt liest sich beim Überfliegen wie ein Befund im Präsens.** Wer aus Kommentaren Befunde zieht, muss den Code darunter mitlesen — und wer solche Kommentare schreibt, sollte den Fix-Commit danebenstellen.

### 11.7 Duplikate

- **`withTimeout` viermal zeichengleich** — `nodes/docsIntentTiebreak.ts:134`, `nodes/editTargetResolver.ts:138`, `nodes/generationResolver.ts:225`, `nodes/queryRefineResolver.ts:173`. Bemerkenswert daran: `apps/api/utils/withTimeout.ts:13` **existiert** und ist exportiert. Die vier Kopien sind also nicht entstanden, weil es das Werkzeug nicht gab. (`agenticLoop/wrapTools.ts:137` zählt nicht dazu — die Fassung dort trägt einen `onTimeout`-Rückruf, an dem die Guard-Buchführung hängt, §4.4.)
- **`resolveLoopModel` zweimal** — `services/recallToolLoopService.ts:45` und `services/sharepicAgenticService.ts:70`.
- **Namensdubletten mit zweierlei Semantik** — gefährlicher als zeichengleiche Kopien, weil ein Leser den falschen Vertrag annimmt: `extractMessageText` (`briefGeneratorNode.ts:38` / `classifierHeuristics.ts:512`) · `extractDomain` (`citationUtils.ts:105`, `searchFormatting.ts:12`, `packages/chat/src/lib/urlUtils.ts:25` — drei Rückgabetypen) · `formatThreadAttachmentsContext` (`respondNode.ts:537` / `attachmentPersistenceService.ts:453`) · `matchesAudience` (`recipeCatalog.ts:50` / `implicitRecipe.ts:73`) · `resolveModel` (`agents/providers.ts:565`, `responseStreamingService.ts:251`, `services/ai/providers.ts:127`).

### 11.8 Kopplung und Konfiguration

- **`agenticLoop/flags.ts` existiert ausschließlich als Zyklusbrecher** und sagt das selbst: ein importfreies Modul, damit der Klassifikator (agents-Ebene) das Flag lesen kann, ohne den Respond-Service zu ziehen (→ Zyklus classifierNode ↔ routing ↔ fastPathGuards). Ein Modul, dessen Existenzgrund ein Importzyklus ist, ist ein Messwert, kein Fehler.
- **`agents/` und `services/agenticLoop/` importieren sich wechselseitig**: sieben Dateien unter `agents/` ziehen `agenticLoop/{routing,sourceRegistry,recipeRegistry,types}`, und `agenticRespondService.ts:26-42` zieht sieben Module aus `agents/` zurück. Die Verzeichnisgrenze bildet keine Schichtgrenze ab.
- **`intentExecutionService.ts`** — der *Nicht*-Loop-Pfad — hängt trotzdem an `agenticLoop/routing` und `sourceRegistry`.
- **Konfiguration: 2 von 20.** Der Code liest **20** verschiedene `CHAT_*`-Umgebungsvariablen (Loop-Budgets, Kompaktierungs-Schwellen, Recall- und Tool-Loop-Modelle, Wall-Clocks); in `.env.example` stehen **zwei** (`CHAT_PASSAGE_DISTILL`, `CHAT_PASSAGE_DISTILL_LLM`, :223/:226). Ein früherer Entwurf schrieb „kein einziges" — das stimmt seit diesen beiden nicht mehr, und der Rest reicht als Befund. Was das kostet, ist im Repo bereits einmal bezahlt und in `agenticLoop/flags.ts:7-11` protokolliert: `CHAT_AGENT_LOOP` stand „weder in `.env` noch in `.env.example`", weshalb „der Loop ist an" eine Annahme war, die nichts stützte — *„und jeder Fix, der für den Loop geschrieben wurde, war dort tot, wo er zählte."*

### 11.9 Geplante Abhilfe

Das anschließende Refactoring-Programm greift die Befunde in dieser Reihenfolge auf:

| Phase | Was | Adressiert |
|---|---|---|
| **A** | Dieses Papier auf Stand bringen, Befund festhalten | §11 |
| **B** | Verhaltensfixes mit eigenem Test, vor jeder Dedup | §11.6 |
| **C** | **Ein LLM-Aufrufweg** — die 66 Umschlag-Aufrufstellen migrieren, dann über `generateStructured.ts` entscheiden | §11.4, §7 |
| **D1** | Router zerlegen: aus Stufen-Kommentaren benannte, einzeln testbare Funktionen | §11.2 |
| **D2** | `agenticRespondService` zerlegen — mit eigener Testdatei, die er heute nicht hat | §11.2 |
| **D3** | `intentExecutionService` zerlegen — ebenfalls ohne eigene Tests | §11.2 |
| **E** | **Ein Turn-Entscheider** statt verstreuter Intent-Teilmengen; die fünf Handkopien ableiten | §11.3 |
| **F** | Neben-Loops zusammenführen (`resolveLoopModel` ×2 und Verwandtes) | §11.7 |
| **G/H** | Recherche-Maschinen und Zitat-Nummerierung zusammenführen | §11.5, §2.4 |

**Reihenfolge ist hier nicht Geschmack.** B vor allem anderen, weil ein Verhaltensfix einen eigenen, rot-geprüften Test braucht und in einer Dedup untergeht. C vor D, weil eine Zerlegung, die drei Aufrufwege mitschleppt, dreimal zerlegt. E nach D, weil der Entscheider erst benennbar ist, wenn die Stufen Namen haben.

---

## Verwandte Dokumente

- `documentation/docs/intern/chat-tool-loop-plan.md` — Entwurf des agentischen Tool-Loops
- `documentation/docs/intern/sharepic-chat-editing.md` — Entscheidungsdoku „strukturierter Call jetzt, Loop später"
- `CLAUDE-mcp.md` — MCP-Server v2, Scopes, Tool-Bridge
- `CLAUDE-routing.md` — Express-5-Typisierung, Worker-Pool-Zugriff
- `docs/typescript-safety-roadmap.md` — formales Vorbild für dieses Papier
