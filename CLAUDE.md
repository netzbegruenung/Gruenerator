# CLAUDE.md

> **NEVER `git checkout -- <file>` without explicit user permission.** Other agents may be working concurrently.

> **Environment**: WSL2. ADB/Gradle use Windows executables via `/mnt/c/`.

> Behavioral guidelines (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) live in `~/.claude/CLAUDE.md` and apply to all projects.

## Project Overview

Grünerator: AI content creation platform for Die Grünen. pnpm monorepo (web, mobile, desktop, API). EU-hosted infrastructure.

**Locale: Austria (de-AT) is a first-class audience alongside Germany (de-DE).** Default to AT-aware code, not DE-with-AT-toggle. When adding agents, tag `audience: 'de-DE' | 'de-AT' | 'all'` explicitly — leaving it undefined defaults to `'all'` for backward compat, not as a way to skip the decision. System prompts with DE-specific terminology must fork via `userLocale === 'de-AT'`; the `## LÄNDERKONTEXT: ÖSTERREICH` block in `systemPrompt.ts` is the established seam. Notebook routing falls back to `oesterreich-notebook` for AT users when an agent has no `defaultNotebookId`.

## Commands

All from repo root (pnpm + Turborepo):

```bash
pnpm install                  # Install all deps
pnpm dev:web                  # Frontend (localhost:3000)
pnpm dev:backend              # Backend (requires Postgres, Redis, Keycloak)
pnpm build                    # Build all
pnpm build:web                # Build web only
pnpm typecheck                # TS check all packages
pnpm lint                     # ESLint all packages
pnpm format:check             # Prettier check
pnpm run ci                   # Full CI: typecheck + lint + format:check + test
pnpm test                     # All tests
```

Single workspace: `pnpm --filter @gruenerator/api test:auth`, `pnpm --filter @gruenerator/desktop dev`

## Architecture

### Monorepo Layout

- **`apps/web`** — React 19 + Vite 7. Feature-sliced design, 26 modules in `src/features/`. Routes: `src/config/routes.ts`.
- **`apps/api`** — Express 5, Node.js cluster mode. AI runs in-process über die typisierte Fassade `services/ai/generate.ts`; die Provider-Ausführung sitzt in `services/ai/execution/`. Der `worker_threads`-Pool und der Dienst, der ihn ersetzte, sind beide weg. Routes in `routes/`, logic in `services/`. See `docs/CLAUDE-routing.md`.
  - **Ein Weg zum Modell: `services/ai/generate.ts`.** `aiText`/`aiObject`/`aiTools` rufen `executeProvider`, geroutet über die Tabelle in `services/ai/lanes.ts`. Der alte, untypisierte Umschlag (`aiClient.processRequest`, `type` als bare string, OpenAI-Drahtnamen wie `max_tokens`, Ergebnis `{content, success}`) ist mit Welle 3 am 16.08.2026 gefallen — `AiClient`, `aiService.ts`, `utils/getAiClient.ts` und `app.locals.aiClient` gibt es nicht mehr. **Wer eine zweite Tür baut, muss `AiProviderError` mitbauen** (die Fassade tut das über `NoAnswerError`), sonst kommt jeder Provider-Ausfall als nacktes `internal` beim Client an. Zwei Fallen: ein `type` OHNE Zeile in `AI_LANES` landet auf `default` und wird als Versehen protokolliert — wer bewusst woanders hin will, nimmt `AiCall.pinned`; und `response_format: {type:'json_object'}` heisst auf der Fassade `json: true`, weglassen macht erzwungenes JSON still wieder zu einer Prompt-Bitte. **Eine Prompt-Config entscheidet nicht über das Routing.** Welches Modell eine Lane bedient, steht ausschliesslich in `AI_LANES`; Prompt-Configs tragen weder `model` noch `provider`, und `promptConfigRouting.vitest.ts` bewacht das über **alle** Configs samt Unterverzeichnissen und der Sharepic-`types`-Bauform. Wer an der Tabelle vorbei muss, sagt das mit `AiCall.pinned` im Code, wo es im Diff steht. Der Wächter ist nötig, weil die Paritätsprüfung in `lanes.vitest.ts` die Lücke nicht sieht: sie fährt beide Tabellen mit leeren Options. `services/providers/providerSelector.ts` läuft noch, aber nur als Prüfmittel für den Paritätstest in `services/ai/__tests__/lanes.vitest.ts`.
  - **Chat: contract router is the only handler.** `routes/chat/chatGraphContractRouter.ts` (+ `agents/langgraph/ChatGraph/` nodes: classifier → search → respond) handles `/api/chat-service/*`; tools are executed by `routes/chat/services/intentExecutionService.ts` (calling services directly — there is no LangChain tool registry). **When debugging chat behavior (intent, tool calls, prompts), check the contract router & ChatGraph nodes first** — confirm via backend logs `[ChatGraph:Classifier]` / `[chatGraphContractRouter]`.
  - **Before restructuring anything in the chat stack, read `docs/chat-architecture-evaluation.md`.** It records what the architecture actually is (the compiled LangGraph graphs have zero callers — the routers hand-sequence the nodes), which duplicates are deliberate vs. drift, what the AI SDK v7 already provides that we hand-rolled, and why Deep Agents was evaluated and declined. Note `/docs/` is gitignored — edits there need `git add -f`.
- **`apps/docs`** — **Deprecated** collaborative editor. New docs features → `apps/web/src/features/docs/` + `packages/docs/`.
- **`apps/mobile`** — Expo 57 / React Native 0.86 with Expo Router.
- **`apps/desktop`** — Tauri 2 wrapper around web frontend. **ALWAYS build the desktop app from `master`, never from a feature branch.** The build bundles the web frontend, but the running app talks to the *deployed production* backend (`gruenerator.eu`). A branch frontend ships calls to endpoints / response shapes prod doesn't have yet → they 404 and the app hangs on loading skeletons. Land desktop changes on `master` first (PR + deploy backend), then build.
- **`packages/chat`** — Shared chat UI, runtime adapters (Assistant UI), stores, hooks. Consumed at `/chat`. Composer controls (modes/models) are defined once here and rendered per-platform — see `docs/CLAUDE-chat.md`; never hardcode mode/model/tool lists in an app.
- **`packages/shared`** — Shared stores (Zustand), hooks, API clients, feature modules. Components in `src/components/`.
- **`packages/sites`** — Embedded candidate-site builder (Home / Login / Demo / Edit pages, editor components, stores). Consumed by `apps/web` at `/sites/*` via `apps/web/src/features/sites/`. No standalone shell; auth/apiClient injected via `<SitesProvider>`.
- **`packages/sites-design`** — Design tokens + presentational components for the site builder (consumed by `packages/sites` and the public candidate sites).
- **`packages/canvas-editor`** — Config-driven react-konva editor. Per-instance Zustand stores via `CanvasStoreProvider`. **Editor UI follows the "Canva-Layout in Grünerator-Grün" design — see `packages/canvas-editor/CLAUDE.md` (mandatory `--editor-*` token layer, no `dark:` utilities, tokens in 4 files).**
- **`services/hocuspocus`** — Hocuspocus WebSocket server for Yjs collab. Zero cross-package deps (inline utils).
- **`services/mcp`** — MCP server (`https://mcp.gruenerator.eu`). See `docs/CLAUDE-mcp.md`.
- **`services/comfyui`** — ComfyUI workflows for local GPU image gen.
- **`services/nlp`** — FastAPI + spaCy (`de_core_news_lg`): Themen, Schlagwörter, Emotionen und Personen für Monitor und Notebooks. Python, **außerhalb des pnpm-Workspace** — `pnpm test` erfasst es nicht, die Tests laufen mit `pytest` (eigener CI-Job „NLP Service (Python)"). Sie brauchen **kein** Modell: die spaCy-Docs werden von Hand gebaut, damit die Zusicherungen deterministisch bleiben. Siehe `services/nlp/README.md`.

### Page Layout Modes

`layoutMode` in `routes.ts` (type `LayoutMode` in `PageLayout.tsx`): `default` (full header + `mt-lg`), `fullscreen` (header + `pt-12` + `h-dvh`), `immersive` (no header, `h-dvh`), `sidebarOnly` (SidebarToggle only), `noChrome` (bare content).

### Resource URLs — Notion-style slugs, never bare UUIDs

User-facing/shareable resource URLs use a Notion-style slug — `slugifyName(name)` + a stable randomized 6-char suffix — **not** a raw UUID. Helpers live in `packages/shared/src/utils/slug.ts` (`slugifyName`, `generateSlugSuffix`, `buildNotebookSlug`/`buildGroupSlug`, `extractSlugSuffix`); reuse them, don't invent a new scheme. The suffix is the stable lookup key (immutable on rename); the name prefix is cosmetic. Store it as a `slug_suffix` column/field, generate it on create, backfill existing rows at boot, and keep a raw-UUID fallback so legacy links keep resolving (extract the suffix → resolve by it; else treat as UUID). Reference impls: notebooks (`NotebookResolver` + `resolveCollection`) and groups (`useGroupResolver` + `resolveGroup`).

### Database & Migrations

- **PostgreSQL**: Schema at `apps/api/database/postgres/schema.sql`. Migrations in `database/postgres/migrations/`, auto-run on startup via `PostgresService.init()`. No `BEGIN`/`COMMIT` in migrations (runner wraps in transaction).
- **Redis**: Sessions, caching, rate limiting.
- **Qdrant**: Vector embeddings for semantic search.

### Content Sync & Scraping

Scrapers in `apps/api/services/scrapers/`. Automated via GitHub Actions (`content-sync.yml`): hourly for Landesverbände, daily for rest. Entry: `apps/api/update-all-content.ts`.

**NEVER full rescrape** (`--force` on all). Only targeted subsets (e.g. PDFs via `reprocess-pdfs.ts`). `satzungen_documents` is dormant — exclude.

**PDFs werden pro Datei nur einmal ausgelesen.** Die Dedup-Kette hing lange am Hash des *extrahierten Texts* — der liegt aber erst nach Download, PDF.js-Parse und (bei Scans) einem seitenweise abgerechneten Mistral-OCR-Lauf vor, sodass jedes unveränderte PDF in jedem nächtlichen Lauf voll bezahlt und erst danach als „unchanged" verworfen wurde. Davor stehen jetzt zwei Gatter aus `services/scrapers/utils/binaryFingerprint.ts`: ein bedingter GET (`If-None-Match`/`If-Modified-Since` → 304 spart schon den Download) und ein SHA-256 über die rohen Bytes gegen den gespeicherten `file_hash`. **Wer ein drittes Gatter baut, muss das Nachtragen mitbauen:** ein PDF mit unverändertem Text schreibt keine Punkte, also persistiert nur der `unchanged`-Zweig (`DocumentProcessor.#refreshExtraPayload` bzw. `ProgramPdfScraper.#persistFingerprint`) den Fingerprint — ohne ihn bliebe jeder Punkt für immer ohne `file_hash` und das Gatter griffe nie. Aus demselben Grund gilt ein Punkt **ohne** gespeicherten `file_hash` als unbekannt, nicht als unverändert: er wird genau einmal ausgelesen und trägt danach seinen Hash.

**Ob die Gatter greifen, steht im Sync-Bericht, nicht in `stored/updated/skipped`.** Dort zählt ein vor der Extraktion übersprungenes Dokument wie ein danach übersprungenes — kosten tun sie sehr verschieden. `services/scrapers/extractionRecorder.ts` zählt deshalb getrennt: was ausgelesen wurde (mit Seitenzahl und OCR-Anteil), was *umsonst* ausgelesen wurde (Text danach unverändert — die Zahl, die gegen 0 gehen soll), und was welches Gatter abgefangen hat. Gezählt wird an den Scraper-Aufrufstellen, **nicht** in `OcrService`: derselbe Dienst bedient Chat-Uploads und Notebook-Ingest, die im langlebigen API-Prozess sonst als Sync-Arbeit mitzählten. Der Puffer muss gedrained werden (wie bei `syncEventRecorder`), sonst trägt ein Lauf seine Zahlen in den Bericht des nächsten.

**`full_text` und `chunk_text` sind nicht derselbe Text.** Was ein Scraper an `smartChunkDocument` übergibt und als `full_text` ablegt, ist strukturerhaltend: Überschriften als `#`-Zeilen, Absätze durch eine Leerzeile getrennt. Das Plattdrücken für die Einbettung passiert **ausschliesslich** im Chunker und landet ausschliesslich in `chunk_text`. **Kein Scraper darf `.replace(/\s+/g, ' ')` auf Fließtext anwenden** — `segmentBlocks` arbeitet zeilenweise, ohne `\n` gibt es genau einen Block ohne Überschriftenpfad, und der Struktur-Pfad ist per Konstruktion unerreichbar. Genau so lagen `bundestag_content`, `gruene_at_documents` und `boell_stiftung_documents` im Index (#3163). Für Titel und Beschreibung bleibt `cleanText` richtig; für Fließtext ist `htmlToStructuredText` (`services/scrapers/utils/htmlCleaner.ts`) die einzige Tür, und `services/scrapers/fulltextStructure.vitest.ts` hält die vier Aufruforte fest — der Riegel liest den Quelltext, weil das Kaputte eine einzelne Zeile ist, die kein Typcheck sieht.

**Diese Reparatur braucht kein `--force`.** Für die drei Sammlungen gibt es kein Fingerprint-Gatter, nur einen Textvergleich **nach** der Extraktion (`content_hash === generateHash(content.text)`). Die Reparatur ändert `content.text` jedes Dokuments, also jeden `content_hash`, also gilt beim nächsten regulären Vollauf jedes Dokument als `updated` und wird neu zerlegt und neu eingebettet — der tägliche Cron um 03:00 CET heilt den Bestand von selbst. Keine zusätzlichen Downloads, kein OCR, keine Seiten.

**Chunk-Grenzen folgen der Struktur, und das hängt an einem einzigen Argument.** `smartChunkDocument` (`apps/api/services/document-services/TextChunker/`) zerlegt den Text zuerst in Blöcke (`blockSegmentation.ts`): eine Pipe-Tabelle bleibt ein Stück (bis 1800 Zeichen — dieselbe Zahl wie `PROMPT_SOURCE_MAX_CHARS`, sonst schneidet der Antwort-Prompt die sorgfältig geteilte Tabelle mitten in einer Zeile wieder ab; darüber zeilenweise mit wiederholter Kopf- und Trennzeile), ein Abschnitt endet an seiner Überschrift, und der Überschriftenpfad steht als `heading_path`/`heading`/`chunk_type`/`section_index` im Payload sowie vor dem Chunk im Einbettungstext (`embeddingText.ts`). Innerhalb eines `text`-Blocks ist alles wie vorher: `sentenceRepack` auf 1600 Zeichen mit 400 Überlappung. Kurze, benachbarte Textblöcke desselben Abschnitts werden vorher zusammengefasst (`mergeSiblingTextBlocks`) — ohne das bekommt jeder Block seinen eigenen Chunker-Lauf, nichts fasst über eine Blockgrenze hinweg zusammen, und ein überschriftendichtes Dokument zerfällt in einen Kleinstchunk je Abschnitt. **Die Erkennung hängt daran, dass die Blockzerlegung `cleanTextForEmbedding(text, true)` sieht** — mit der Vorgabe `preserveStructure=false` ersetzt die Funktion jedes `\s{2,}` durch ein Leerzeichen (`services/text/cleaning.ts:74-76`) und macht aus einer Tabelle eine Zeile, bevor irgendjemand sie erkennen kann. Wer das Argument „aufräumt", schaltet den Mechanismus still ab; der Wächter dagegen ist `blockSegmentation.vitest.ts`. Der zweite Wächter ist `chunkingGolden.vitest.ts`: ein Dokument **ohne** Markdown-Überschriften und **ohne** Pipe-Zeilen läuft über einen Schnellpfad durch den alten Code und muss byteweise dieselben Chunks erzeugen — die Sprengweite dieser Änderung ist damit exakt „Dokumente mit Überschriften oder Tabellen". Im Payload steht, welcher Chunker einen Punkt geschrieben hat: `chunkingMethod: 'structure-blocks'` gegen `'langchain-sentences'`. Zwei Dinge, die dabei nicht stimmen und je ein Issue haben: `'langchain-sentences'` ist gelogen, es ist kein LangChain installiert (#3135), und **eine Code-Änderung am Chunker wirkt nur auf neu eingelesene Dokumente** — für den Bestand braucht es einen Re-Chunk aus gespeichertem Volltext, den es heute nicht gibt. Bis der Re-Ingest aus #3145 gelaufen ist, stehen in derselben Sammlung deshalb Vektoren nebeneinander, die MIT und OHNE vorangestellten Überschriftenpfad eingebettet wurden; wer Ähnlichkeitswerte zweier Treffer vergleicht, vergleicht dann zwei verschieden gebaute Eingaben.

### Authentication

Keycloak OIDC via Passport.js. Multiple IdPs (.de, .at, .eu). Sessions in Redis.

**Better Auth**: Config at `apps/api/config/betterAuth.ts`. Tables use `ba_` prefix, snake_case columns. `fields` mapping must cover every camelCase→snake_case column or Kysely queries fail.

**Dev Auth Bypass**: `VITE_E2E_AUTH_BYPASS=true` + token in `apps/web/.env`, `ALLOW_DEV_AUTH_BYPASS=true` + token in root `.env`. Production fail-fast: `ALLOW_DEV_AUTH_BYPASS=true` in prod → HTTP 500.

**Debugging the PRODUCTION bundle locally** (bundle-only bugs: chunk init order, lazy-load timing): the bypass is baked in at BUILD time (`import.meta.env` is inlined), so set `VITE_E2E_AUTH_BYPASS=true` in `apps/web/.env` BEFORE `pnpm build:web`, then serve with `cd apps/web && VITE_E2E_AUTH_BYPASS=true VITE_DEV_AUTH_BYPASS_TOKEN=<token> npx vite preview --port 3101`. The preview proxy (vite.config `preview.proxy`) forwards `/api` to the local backend on :3001, attaches the `x-dev-auth-bypass` header AND rewrites the `origin` header to `http://localhost:3000` — the backend's CORS allowlist only accepts :3000, so without the rewrite every API call fails with "Not allowed by CORS". Port 3000 is often taken by a running dev server; any other port works because of the rewrite. In worktrees, `.env` files are untracked — copy them from the main checkout first.

### AI Providers

Mistral AI (primary, EU), self-hosted GPT-OSS/Gemma via LiteLLM/verdigado, Seeweb/Regolo AI (EU; Textmodelle, Rerank-Rückfall, Bildgenerierung mit **Qwen-Image** — nicht FLUX, siehe `RegoloImageService.ts`), GreenPT BV (NL, Verarbeitung in FR; Textmodelle, Transkription und Reranking), Scaleway (EU/Paris; liefert Gemma 4 und Whisper — Mistral Medium 3.5 lief dort und ist seit 08/2026 wieder direkt bei Mistral, siehe unten), Flux/BFL (images). NOT used in production: Together AI (historical fine-tuning experiment only, see `docs/CLAUDE-finetuning.md`), AssemblyAI, Gladia, Bedrock/Claude. No ultra/pro/privacy mode flags — model routing is type-based in `providerSelector.ts`; explicit model choice exists only in Playground, mobile chat, and agent configs.

**Mistral Medium 3.5 läuft seit 08/2026 wieder direkt auf der Mistral-API** — der Scaleway-Upstream lieferte im Betrieb fehlerhafte Antworten. Der Schalter ist `SCALEWAY_MISTRAL_ROUTING` (Standard `false`), abgefragt über `isScalewayMistralRoutingEnabled()` in `services/ai/providerInstances.ts`. Er sitzt dort und nicht an den Aufrufern, weil **drei** Pfade dieselbe Frage stellen: `routeMistralModel` für normale Turns, `SCALEWAY_MISTRAL_MODELS` in `regoloReasoningStream.ts` für die Denk-Lane und `leadModel()` in `services/research/deepAgent/models.ts` für Deep Research. Der dritte wurde beim ersten Anlauf übersehen: er baut sein eigenes `ChatOpenAI` (LangChain statt AI SDK) und nennt den Host in einer lokalen Konstante — weder die Routing-Tabelle noch ein Grep nach `routeMistralModel` führt dorthin. **Wer den Schalter anfasst, greppt `scalewayBaseUrl()`**, das ist die Liste derer, die den Host wirklich wählen. Die Maschinerie darunter (Routing-Tabelle, Fallback-Fetch, Denk-Lane, Tests) steht vollständig; Zurückschalten ist reine Konfiguration. Nicht betroffen: `provider: 'scaleway'` (Gemma 4, auch der Deep-Research-Worker) und Scaleways Whisper.

**Scaleway ist ein Upstream, kein `ProviderName`.** Wenn das Routing an ist, ist die Mistral-API der Fallback; die Weiche steht in `routeMistralModel` (`services/ai/providerInstances.ts`) — eine Ebene UNTER dem Lane-Namen. Grund: alles Policy-Relevante prüft `provider === 'mistral'` (`isAgenticToolCapable`, Kontextfenster, Fallback-Ketten), ein Geschwister-Provider hätte das fürs Hauptmodell still abgeschaltet. Deshalb brauchen die ~20 Aufrufer, die `mistral-medium-2604` hart benennen, keine Änderung. **Zwei Ausnahmen bleiben bewusst auf der Mistral-API:** Denk-Anfragen (`providerOptions.mistral` erreicht einen OpenAI-kompatiblen Client nie — stiller Verlust; roh erzwungen liefert Scaleway leeren `content`, weil das Reasoning gegen `max_tokens` zählt) und alles außer Medium (Pixtral, Small, Embeddings). Scaleways Whisper kann **nur Segment-**, keine Wort-Zeitstempel — `WORD_TIMESTAMP_CHAIN` in `services/transcription/providerPolicy.ts` hält es aus dem Untertitel-Pfad heraus, weil eine wortlose Antwort kein Fehler ist und die Fallback-Schleife sie sonst als Erfolg akzeptieren würde.

**Transkription: `TRANSCRIPTION_CHAIN` ist Voxtral, dann GreenPT — Regolo ist raus.** Es stand hier jahrelang als primärer Transkriptionsanbieter und ist es seit dem Umbau von `services/transcription/providerPolicy.ts` nicht mehr; die Begründung (Regolos eigene 2-Minuten-Grenze gegen Halluzinationen, live reproduziert) steht dort im Kopfkommentar. Regolo macht weiterhin Textmodelle und Bilder — beim Reranking ist es seit 28.08.2026 der Rückfall, nicht mehr die erste Adresse (siehe unten). Wer wissen will, wohin Eingaben tatsächlich gehen, liest `ProviderName` in `services/ai/providers.ts` und `TRANSCRIPTION_CHAIN` — nicht diese Datei und nicht die Datenschutzerklärung, die beide schon einmal hinterherhinkten.

**Reranking: GreenPT zuerst, Regolo dahinter.** Beide Anbieter servieren dieselben Gewichte — `green-rerank` IST `Qwen3-Reranker-4B` —, es ist also ein Host-Wechsel und kein Modellwechsel; am 28.08.2026 gegen beide Hosts gemessen, gleiche Dokumente, gleiche `<Instruct>`/`<Document>`-Verpackung: identische Rangfolge, Spitzenwert 0,8437 gegen 0,8409. Auf dem echten Korpus (`evals/retrieval/runRetrievalEval.ts` mit `EVAL_RERANK=1`, 52 Fälle, beide Arme über `GREENPT_RERANK_ENABLED`, Retrieval davor in beiden Läufen identisch): nach Rerank Hit@1 40,4 % gegen 38,5 %, MRR 0,569 gegen 0,559 — **ein** Fall von 52, also Rauschen. Was das belegt, ist nur die negative Aussage: der Hostwechsel kostet keine Qualität. **Die Schwelle ist getrennt gemessen**, weil die Eval mit `minRelevance: 0` fährt und sie nie berührt: gepaart, dieselben 48 Kandidatenmengen aus der Produktion, beide Hosts auf der identischen Dokumentliste, 1046 Dokumentpaare. Abstand GreenPT − Regolo im Median −0,010 (Spanne −0,164 … +0,140); über der Schwelle 0,2 bleiben 783 gegen 804 Dokumente (−21, −2,6 %), 30 Übertritte nach unten und 9 nach oben, alle im Band 0,149–0,200; das oberste Dokument wechselt in 3 von 48 Fällen. Der Versatz ist also real, aber halb so groß wie eine Drei-Dokumente-Probe nahelegte, und nicht einseitig. Von den 30 weggeschnittenen Dokumenten sind 5 Gold; in vier Fällen überlebt ein anderes Gold-Dokument, **ein** Fall verliert sein einziges (`grundsatz-btw25-wirtschaft`, 3 Kandidaten, Gold bei 0,1982 gegen Regolos 0,2122). Wo der Aufrufer `minKeep: 5` mitgibt (`rerankNotebookResults`, Research-Router), ist auch der gedeckt — mit Produktions-`minKeep` verliert **kein** Fall sein Gold. `rerankNode` und `pastChatRecallService` geben kein `minKeep` mit und behalten das Risiko: ein Fall von 48, direkt an der Schwelle. Wenn Trefferlisten nach dem Rerank je dünner wirken als erwartet, ist das Band 0,15–0,20 die erste Stelle zum Nachsehen. **Der Grund für den Wechsel ist die Messung**: GreenPT liefert ein `impact`-Objekt, Regolo liefert gar nichts — jeder Rerank-Aufruf war bis dahin echte Energie ohne Zurechnung im „Nutzung"-Tab. Zwei Dinge, die man dabei wissen muss: das `impact`-Feld auf `/v1/rerank` ist **undokumentiert** (docs.greenpt.ai zeigt nur `usage`/`inferenceTiming`), verifiziert nur am lebenden Endpunkt — fällt es weg, misst niemand mehr, und das Ranking läuft weiter; und GreenPTs Limit von 600 Anfragen/15 min gilt **pro Konto über alle Endpunkte**, geteilt mit der Planer-Lane (`autoPolicy`) und `GreenPTSearchService`. Reranking ist der häufigste der drei Verbraucher (ein Aufruf je Suche plus einer je gecrawlter Seite über `PassageDistiller`), darum hat `GreenPTRerankService` einen Circuit Breaker: zwei Fehlschläge hintereinander und der Host ruht fünf Minuten, Regolo trägt solange. Gezählt werden auch **Zeitüberschreitungen und Netzfehler**, nicht nur 429/503 — ein 429 scheitert in Millisekunden und wird auf Regolo wiederholt, eine Zeitüberschreitung verbrennt die vollen 4 s und wird bewusst NICHT wiederholt, kostet ungezählt also bei jedem Rerank Zeit UND Rangfolge. Ein anderes 4xx zählt weiter nicht: das ist unser eigener Fehler und soll laut bleiben. Unter Last geben wir die Messung auf, nicht die Sortierung. Der Rückwärtsgang ohne Deploy ist `GREENPT_RERANK_ENABLED=false`.

**Notebook-Evidenz: gemessen wird der dichte Spitzenwert VOR dem Rerank, und er liegt dunkel.** `SearchContext.evidenceTop` = `max(dense_similarity ?? similarity)`, gebildet in `NotebookQAService.evidenceTopOf` — nach `rerankNotebookResults` ist die Zahl weg, weil der Cross-Encoder-Wert auf `similarity` zurückgeschrieben wird; wer das Signal woanders abgreift, misst den Rerank, und der trennt nachweislich **nicht** (#3140, Abstand −0,1601). `notebookStreamCore` protokolliert `evidenceTop` bei jeder Anfrage und sendet `evidence_weak` nur, wenn `NOTEBOOK_EVIDENCE_WEAK_ENABLED` an ist (Default **aus**), der Wert unter `NOTEBOOK_EVIDENCE_WEAK_THRESHOLD` liegt (Default 0,9356), die Tiefe nicht `fast` ist (kalibriert wurde nur auf `deep`) und der Aufrufer nicht der Grün-O-Mat ist (`emitEvidenceWarning: false` — er fährt ohnehin `fast`). Die Schwelle hängt am Einbettungsmodell (`mistral-embed`, 1024 Dim.) und am Legacy-Score-Pfad: ein Modellwechsel oder eine BM25-Migration einer Notebook-Sammlung (roher Kosinus, ca. 0,33 tiefer) macht sie bedeutungslos, **ohne dass ein Test rot wird**. Kalibriert an 30 Fällen (`evals/retrieval/evidence-signals-2026-09-02-v2.md`: on-topic ab 0,9581, off-topic bis 0,9130); der deutsche Satz steht an genau einer Stelle, `CHAT_WARNINGS.evidence_weak.message`. Gerendert wird er nur vom Web-Client (`AssistantMessage`, unter der Antwort statt als Toast); Mobile teilt sich `NotebookModelAdapter`/`parseSSEStream` und setzt `custom.evidenceWeak` genauso, zeigt ihn aber nicht an.

**Websuche: Linkup** (`LinkupService.ts`, `LINKUP_API_KEY`). Die `linkup-*` Skills gelten auch für unseren Integrations-Code: `depth` ist eine Kostenentscheidung — `fast`/`standard` als Default, `deep` nur für „erst URL finden, dann scrapen".

**Hybrid-Suche: `similarity` ist nicht überall ein Kosinus.** Auf einer Sammlung mit Sparse-Vektoren (heute nur `kommunalwiki_documents`) fusioniert Qdrant server-seitig, und der zurückgegebene `score` ist ein Fusionswert — RRF liegt auf Rang 1 bei ≈ 1,0, DBSF läuft nahe 0 aus. Die Schwellen der Notebook-Ebene (0,35 in `notebookDepthProfiles.ts` und `NotebookQAService.ts`) sind dagegen als Kosinus geschrieben. Seit #3166 holt `hybridSearchServerSide` den dichten Kosinus und den BM25-Wert je Treffer über zwei zusätzliche Einträge desselben `queryBatch` zurück (`HYBRID_SERVER_SCORE_JOIN`, ein Rundlauf bleibt ein Rundlauf), und `SearchResultProcessor.filterAndSortResults` schneidet auf `dense_similarity ?? similarity` — **sortiert** wird weiter auf `similarity`. **Der Rückfall ist Pflicht:** `dense_similarity` gibt es nur für Treffer aus dem Server-Join; auf dem Alt-Pfad bleibt es leer (dort ist `similarity` der gewohnte, verstärkte Wert, auf dem die 0,35 immer schon lag), ebenso bei Dokumenten, deren Chunks nur aus der BM25-Lane kamen — ein Leser ohne `?? similarity` misst dort `undefined`. Und: die dichte Spiegelsuche trägt dieselbe `score_threshold` wie der Schnitt, ein Join-Wert liegt also per Konstruktion über der Schwelle; der Schnitt greift nur bei Treffern ohne Join-Wert, und dort weiter auf dem Fusionswert. Zahlen und Deckungsgrad: `apps/api/evals/retrieval/hybrid-dense-join-2026-09-02.md`.

## Development Conventions

### Git Safety

- **NEVER `git stash`/`git stash pop`** — causes merge conflicts, loses work. Commit to a branch instead.
- **Before PR**: `git fetch origin master` to ensure fresh remote ref.
- **Regular merge only** (not squash). `test-branch` is long-lived; squash breaks commit identity.
- **PR merges require admin.** `gh pr merge` fails — ask user to merge via GitHub UI.
- **Worktree weg, sobald alles gepusht ist** — nicht erst nach dem Merge. Ein offener PR braucht kein lokales Verzeichnis, er lebt auf `origin`. Kriterium: `git status --porcelain` **und** `git log @{u}..` beide leer → `git worktree remove <pfad>` (Branch bleibt stehen). Nach dem Merge zusätzlich `git branch -d <br> && git worktree prune`. Nie `--force`, nie fremde Worktrees — andere Agenten arbeiten parallel.

### Sprache auf GitHub: Englisch

**Alles, was auf GitHub landet, wird auf Englisch geschrieben** — PR-Titel und -Beschreibung, PR- und Review-Kommentare, Issues (Titel, Body, Kommentare), Commit-Subject und -Body, Branch-Namen. Auch dann, wenn das Gespräch hier auf Deutsch läuft: deutsche Log-, Code- oder UI-Zitate bleiben im Original, die Prosa drumherum ist Englisch.

Nicht betroffen und weiterhin deutsch: dieser Chat, die Doku im Repo (`CLAUDE.md`, `docs/`, `documentation/`) und alles, was Nutzer*innen im Produkt sehen.

### Nebenbefunde werden Issues, nicht Prosa

**Ein Fehler, der bei anderer Arbeit auffällt, wird als GitHub-Issue abgelegt** (auf Englisch, siehe oben) — nicht nur im Chat erwähnt, nicht nur als Kommentar im Code, nicht in `/docs/` (gitignored). Der Chat ist weg, sobald das Fenster zu ist; ein Issue überlebt den Kontext und ist der Ort, an dem andere Agenten und Menschen danach suchen.

Gilt für alles, was ohne Zutun auffällt: ein 404 in einem mitgelesenen Log, ein `ContextCap`-Deckel, der mehr wegschneidet als gedacht, eine Zahl in der Antwort, die nicht zur Quelle passt.

Das Issue trägt die **Belege, nicht die Vermutung**. Konkret:

- **Die Logzeilen im Original**, mit Zeitstempel und Zahlen, nicht nacherzählt. `cap hit: 13790 → 1500 chars (12290 dropped, 89%)` ist der Befund; „die Kürzung ist zu hart" ist es nicht.
- **Die Stelle im Code** als `datei.ts:zeile` — nach dem Nachsehen, nicht nach dem Vermuten. Die Logs sagen *dass* etwas passiert; erst der Code sagt *warum*.
- **Die Reproduktion**, soweit bekannt: welches Dokument, welche Frage, welcher Thread.
- **Was ungeprüft ist, steht als ungeprüft da.** „Mistral OCR hätte die Tabelle vermutlich sauber — die beiden Texte wurden nicht verglichen" ist eine brauchbare Aussage; dieselbe Vermutung als Tatsache geschrieben schickt die nächste Person in die falsche Richtung.
- **Die Falle beim Reparieren**, wenn du eine gesehen hast. Beim Nachsehen fällt oft auf, dass die naheliegende Reparatur nicht wirkt — das ist das Wertvollste am Befund und geht sonst verloren.

Beispiele: #2817 (doppelte Quelle — der Deckel ist nicht der Kern, der Schlüssel ist es), #2818 (zwei PDF-Extraktoren), #2819 (QueryRefine verliert das Thema — der Kontext fehlt nicht, die Prompt-Regel).

Was **kein** Issue braucht: was du im selben Zug reparierst, und was schon eins hat (`gh issue list --search`).

### Ein PR, der ein Issue abarbeitet, schließt es selbst

**Wer ein Issue in einem PR repariert, verlinkt es so, dass GitHub es beim Merge selbst schließt.** Sonst steht das Issue noch offen, wenn die Ursache längst weg ist, und die nächste Person arbeitet es ein zweites Mal ab — genau die Verschwendung, gegen die der Abschnitt oben antritt.

GitHub wertet dafür **nur englische Schlüsselwörter** aus, direkt gefolgt von `#<nummer>`, und nur in der **PR-Beschreibung** oder einer Commit-Message — **nicht im PR-Titel**: `close`/`closes`/`closed`, `fix`/`fixes`/`fixed`, `resolve`/`resolves`/`resolved`. Ein deutsches „Behebt #2887" liest sich für Menschen richtig und tut **nichts**; es erzeugt bloß eine Erwähnung. Mehrere Issues brauchen je ein eigenes Schlüsselwort: `Closes #1, closes #2` — `Closes #1, #2` verlinkt nur das erste.

**Nachsehen, nicht annehmen.** Ob die Verknüpfung wirklich steht, sagt die API, nicht der Text:

```bash
gh api graphql -f query='{repository(owner:"netzbegruenung",name:"Gruenerator"){pullRequest(number:PRNUMMER){closingIssuesReferences(first:10){nodes{number state}}}}}' \
  -q '.data.repository.pullRequest.closingIssuesReferences.nodes'
```

Leeres Array = kein Schlüsselwort erkannt. Steht es, erscheint es auch als „Linked issues" in der PR-Seitenleiste.

**Automatisch geschlossen wird nur beim Merge in `master`.** Ein PR gegen `test-branch` lässt das Issue offen, auch mit korrektem Schlüsselwort — die Verknüpfung bleibt aber stehen und greift, sobald dieselbe Arbeit auf `master` landet.

Ohne Schlüsselwort bleibt, was nur *erwähnt* gehört: verwandte Issues, Vorgänger-PRs, und ein Nebenbefund, den dieser PR gerade **nicht** repariert — der bekommt sein eigenes Issue, siehe oben.

### Agent-Skills & versionsgenaue Doku

**Bevor du Code gegen eine Library änderst (AI SDK, Tailwind v4, LangGraph, Drizzle, Zod, Qdrant, Expo, Tiptap, Better Auth, Linkup, …): erst die versionsgenaue Quelle lesen, nicht aus dem Gedächtnis schreiben.** Welche Skill bzw. welches `llms.txt` — und die Fallen dabei — stehen in `docs/CLAUDE-agent-docs.md`. Ein Tool-Call ist billiger als ein Debug-Zyklus an einer umbenannten API.

### Expo Apps

Expo-Skills sind als Plugin `expo@claude-plugins-official` installiert (user scope) — siehe *Agent-Skills & versionsgenaue Doku*. Use `npx expo install` (not `pnpm add`). See `docs/CLAUDE-expo.md`. Always use `expo-image` (not RN `Image`) — RN can't render SVGs.

**React version is decoupled between web and mobile — never use a single global override.** RN bundles `react-native-renderer` pinned to one EXACT React version; React's runtime check rejects any mismatch (symptoms: `Incompatible React versions`, then cascading `Maximum call stack size exceeded` / `Cannot read property 'ErrorBoundary' of undefined` / phantom "missing default export" route warnings). So:
- `apps/mobile` pins `react`/`react-dom` to the **exact** version the Expo SDK ships. Bump it **only** via `npx expo install react react-dom` during an SDK upgrade — never independently. Dependabot ignores react/react-dom for `/apps/mobile` entirely (`.github/dependabot.yml`).
- Web/api/gruen-o-mat track their own react (`^`/latest) — separate Vite/Metro bundles never share a React runtime, so they need not match mobile.
- Do **not** add `react`/`react-dom` to root `pnpm.overrides`: a global override forces mobile to web's version and breaks RN. Shared `packages/*` declare react as `peerDependency: ^19.0.0`, so they inherit each consumer's react — no override needed for dedup.

### Styling & UI

See `docs/CLAUDE-styling.md` for Tailwind v4, theme/dark mode, CSS variables, shadcn/ui setup, docs app conventions.

### Barrierefreiheit

Zielstandard WCAG 2.2 AA im Rahmen von EN 301 549. **Vor Farb-, Karten-, Fokus- oder ARIA-Änderungen `docs/CLAUDE-a11y.md` lesen** — dort stehen die Prüfmittel je Ebene, die Farbregeln (ein Token kann nicht `bg-` und `text-` in beiden Modi bedienen; `opacity` frisst den Kontrast von allem darin) und das Messrezept, ohne das jede Nachmessung zwanzigmal die Loginseite prüft und grün meldet. Öffentliche Selbstauskunft: `documentation/docs/basics/barrierefreiheit.md` — bei behobenen oder neuen Mängeln dort das Stand-Datum und die Liste nachziehen.

### State Management

Zustand (global state). TanStack Query v5 (server state/fetching) with axios.

### Naming, IDs & Renames

**Drei Frozen-Stufen — jeden Rename zuerst einordnen:**

- **F0 — extern eingefroren (Rename existiert nicht):** DB-Tabellen/-Spalten, Contract-Feldnamen und `z.enum`-Werte, MCP-Tool-Namen, Qdrant-Collections, Redis-/localStorage-Keys, Env-Vars, IDs in persistierten Inhalten (z. B. Mention-Tokens), CI-Job-Namen in Required Checks. Änderung nur **additiv**: Neues emittieren UND Altes tolerant weiterlesen, Deprecation mit Datum. Grund: ausgelieferte Mobile-Binaries, externe MCP-Clients und Nutzerdaten sprechen das alte Format weiter — der Compiler sieht nur den aktuellen Quellstand. URLs sind F0 mit Sonderrecht: neuer Pfad erlaubt, alter Pfad leitet für immer weiter (Slug-Suffix-/Redirect-Muster).
- **F1 — intern eingefroren:** Registry-IDs (Tool-, Agent-, Intent-, Notebook-IDs, Icon-/Theme-Keys). Werden nicht umbenannt, auch wenn sie semantisch veralten — ein Kommentar in der Registry ist billiger als jede Migration. Notausgang nur mit Begründung im PR: Alias mit Ablaufdatum (Vorbild: `LEGACY_ID_ALIASES` + zustand-persist `version`/`migrate` in `sidebarFavouritesStore.ts`).
- **F2 — frei:** Code-Symbole, Datei-/Ordnernamen, Anzeigenamen, Doku-Prosa. IDE-Rename/`git mv` genügt — genau dafür halten F0/F1 sie von der Persistenz entkoppelt. Anzeigenamen leben an genau einer Stelle (Registry-`title` bzw. der eine JSX-String, den das UI-Label-Manifest kennt).

**Registry-Pflicht für neue ID-Mengen:** als `as const`-Registry mit exportierter Literal-Union anlegen (`type FooId = (typeof FOOS)[number]['id']`); Konsumenten leiten ab und deklarieren nie neu. Zuordnung: Wire-querende Mengen → benanntes, exportiertes `z.enum` in `@gruenerator/contracts` (nie inline duplizieren); rein Client-seitige → Config-Registry (Vorbilder: `documentation/src/nav/sections.ts`, `packages/shared/src/agents/`); Doku-Präsentation → `sections.ts`. Accessoren nehmen die Union, nicht `string`.

**Persist-Konvention:** Jeder zustand-persist-Store wird mit `version` + `migrate` angelegt. DB-Umbauten mit ID-Semantik: expand → backfill/dual-write → contract; bei Spalten-Änderungen alle Queries greppen.

**Sprachregelungen (Produkt-Wording):** Plural **„Grüneratoren"**, Singular **„Grünerator-Agent"** (nie „Agent" allein — „der Grünerator" meint das Produkt); **„Rezepte"** (nicht „Skills"); **„Projekte"** (nicht „Gruppen"/„Spaces"); **„Notebook"/„Notebooks"** (nie „Notizbuch"/„Notizbücher"). Neue Produktnamen hier eintragen, bevor das Feature gebaut wird.

**„Notizbuch" ist verboten — mit genau zwei Ausnahmen.** Das Wort ist am 27.08.2026 aus Code, UI und Doku entfernt worden; es lebt nur noch da weiter, wo es NICHT für uns steht:

- **Detektoren über Nutzereingaben.** `GRUENERATOR_FEATURE_NOUN` (`classifierSignals.ts`) und `PERSONAL_DATA_RE` (`agenticLoop/routing.ts`) lesen, was Leute TIPPEN, und die tippen das alte Wort weiter. Dort steht `notizb[üu]ch\w*` **neben** `notebooks?`, nicht statt dessen — dasselbe gilt für den `notiz`-Präfix in `filterMentionables`, über den `@notizbuch` weiterhin die Notebook-Kategorie öffnet. Wer die alten Zweige „aufräumt", senkt still den Recall.
- **Der eingefrorene MCP-Prompt `notizbuch-antwort`** (`mcp-server/serverFactory.ts`), Alias auf `notebook-antwort` mit eigenem Argumentnamen `notizbuch`. MCP-Prompt-Namen sind F0: ausgelieferte Clients fragen den alten Namen weiter. Abzuräumen ab 27.08.2027; `serverFactory.vitest.ts` bewacht ihn bis dahin.

Ein Grep, der beide Ausnahmen mitzählt, meldet nichts Reparierbares. Alles andere ist Drift und gehört umbenannt — inklusive der Komposita, die dabei einen Bindestrich brauchen (**„Notebook-Fläche"**, nicht „Notebookfläche").

### Parteiinterne Inhalte gehören nicht in dieses Repo

**Dieses Repo ist öffentlich, und `packages/shared` landet im Web-Bundle und in jeder ausgelieferten Mobile-Binary.** Was dort hineingerät, ist veröffentlicht — `.gitignore` kommt zu spät, und eine ausgelieferte Binary holt man nicht zurück.

Betroffen sind **Rezept-Prompts und Agenten-Personas**: `agents/skills/*.md` und `agents/definitions/*.md` in `packages/shared` tragen nur Frontmatter. Der Prompttext liegt im privaten Repo `netzbegruenung/gruenerator-intern` und wird zur Laufzeit aus `INTERN_CONTENT_DIR` gelesen (`apps/api/services/skills/internalPrompts.ts`) — Rezepte in `respondNode`, Personas in `routes/chat/agents/agentLoader.ts`. Dasselbe gilt für Korpus-Rohdaten und Sprachanalysen unter `documentation/docs/intern/`.

Auch die generierten LV-Agenten (`lvPrAgents.ts` / `lvBuergerAgents.ts` / `lvWahlpruefsteinAgents.ts`) liefern `systemRole: ''` — ihre Kurzrollen (2–3 Sätze: Identität + Rezept-Verweis) liegen als `agents/<identifier>.md` im internen Repo. Das Textsorten-Wissen steht ausschließlich in den Rezept-Bodies (`skills/`); im Chat lädt es der Single-Pass-Pfad über `defaultRecipeMention` automatisch, der agentische Loop über `rezept_laden`. Rollen enthalten bewusst keine Themenlisten und keine zeitgebundenen Fakten — Themen gibt der*die Nutzer*in vor, Personen/Wahlkampfstände leben nur im Rezept.

`pnpm check:internal` (in `pnpm run ci` und in der CI) bewacht die Grenze. Neue interne Pfade in `PRIVATE_PREFIXES` in `scripts/check-internal-content.mjs` eintragen — **nicht** nur in `.gitignore`: eine bereits getrackte Datei ignoriert git weiter fröhlich mit (genau so lagen 26 Dateien aus `documentation/docs/intern/` auf `origin/master`, obwohl der Pfad seit Langem in `.gitignore` stand).

### Commits

Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`), **auf Englisch** (siehe *Sprache auf GitHub*). Atomic: one logical change per commit.

**Subject nach dem Doppelpunkt klein schreiben** — commitlint (`subject-case`) bricht sonst ab. lint-staged hat dann schon formatiert und re-staged: Commit einfach neu absetzen, es geht nichts verloren.

### TypeScript

Strict mode, entire stack. `import { type Foo }` (inline style, not `import type`). Never use `undefined` — widen to `| null` or omit optional fields.

**Type-safety rules** (full rationale in `~/.claude/projects/-home-morit-gruenerator/memory/feedback_typescript_advanced_patterns.md`):

1. **Defaulted generics for shared infra** — stores/hooks/factories shared across heterogeneous configs use `<T extends Record<string, unknown> = Record<string, unknown>>`. Existing call sites resolve to the default unchanged; opt-in stronger typing flows via inference from typed callbacks.
2. **Discriminated unions — never destructure** — `const { type, data } = obj` breaks narrowing. Keep `obj.type`/`obj.data` access through the if-chain so each branch auto-narrows.
3. **Existential types via render closure** — for arrays of `Item<T1, T2, TInner>` where `TInner` varies per element, capture `TInner` inside `defineItem`'s closure and expose only a `render()` method. `Item<T1, T2>` (no third generic) sits cleanly in the array.
4. **Boundary casts vs type holes** — a cast at a true type boundary IS the assertion (e.g. `Record<string, unknown>` → typed extraction, async heterogeneous-config loader). A cast in a flow path where a discriminated union or constraint would suffice is a hole. Don't remove the former; do remove the latter.
5. **Documented escape hatches** — computed property keys widen to `string` (`as Partial<State>` is the workaround); Immer `Draft<T>` conditional fails for unconstrained generics (`as (typeof state.field)[number]` at the push); one localized contravariance bridge cast at hook→provider boundaries when generic flows into a default-typed slot. Always comment why.

### Runtime types — Zod & Drizzle

Two canonical sources of truth. **Always derive TS types from them; never hand-duplicate the shape.**

- **Zod (HTTP boundaries):** define request/response schemas with `z.object({...})`. Use `validateBody(schema)` middleware on Express routes; handler receives `TypedRequest<z.infer<typeof schema>>`. Never `& AuthenticatedRequest` (collapses body to `any`); `TypedRequest<T>` already includes auth fields. For response types and cross-package contracts, prefer `z.infer<typeof schema>` over hand-written interfaces.
- **Drizzle (database):** schemas in `apps/api/database/schema/*.ts` as `pgTable(...)`, re-exported from `database/schema/index.ts`. Derive row types via `type Row = InferSelectModel<typeof tableName>` next to the schema; never declare a row interface by hand. **Migrations are raw SQL in `apps/api/database/postgres/migrations/`, auto-run on startup via `PostgresService.init()` — NOT `drizzle-kit migrate`.** Schema files are the type source; SQL files are the runtime DDL. Keep them in sync.

**Type-safety pass on bigger refactors:** Any non-trivial feature change (new endpoint, new dispatcher branch, new shared type) MUST audit the 4 layers before finishing:
1. **Contract (`@gruenerator/contracts/contracts/*Contract.ts`)** — is the endpoint contracted via ts-rest? If yes, frontend uses `getContractsClient()` and gets typed `result.body` per status code. If no, audit whether it should be (especially user-facing endpoints triggered from typed UI).
2. **Zod schema (`@gruenerator/contracts/schemas/*.ts`)** — is the request/response shape a Zod schema, with TS types derived via `z.infer`? Free-string fields (`z.string()`) representing a fixed set MUST be `z.enum([...])`. No hand-written response interfaces alongside a schema.
3. **Drizzle (`apps/api/database/schema/*.ts`)** — does the table use `pgTable(...)` with `InferSelectModel`? Service layer uses the inferred row type; never re-declares a parallel interface.
4. **ts-rest server (`*ContractRouter.ts`)** — every contract has a matching `initServer().router(contract, {...})` mounted via `createExpressEndpoints`. No silent legacy duplicate route on the same path.

Symptom of a missed pass: a frontend interface that duplicates a backend schema's shape, a `z.string()` field whose values are actually a closed set, or a typed-UI button that POSTs through raw `apiClient` instead of the contracts client.

### Backend Routing & Typing

See `docs/CLAUDE-routing.md` for Express 5 route typing, `TypedRequest`/`AuthRequest`, AI client access, locale-aware backend rules, and the admin surfaces with their `requireInstanceAdmin` gate (incl. the chunk inspector).

### External API Clients & SSRF

Validate user-provided URLs via `validateUrlForFetch()` from `utils/validation/urlSecurity.ts`. Use validated `url` from result. Use `new URL()` for normalization. CodeQL scans PRs for SSRF.

### Database Column Type Changes

When changing column type via migration, grep all queries for that column and update type casts. `$1::uuid` on a `TEXT` column fails at runtime.

### Code Quality

ESLint (flat config), Prettier, Husky pre-commit (lint-staged), Knip (unused code). Don't add files to `allowDefaultProject` if already discovered by TS project service.

**`pnpm.overrides` hat zwei Ausfallarten, und für jede gibt es einen eigenen Check.** Ein Override *ersetzt* den Bereich, den ein Paket selbst deklariert, und pnpm prüft danach nicht mehr nach — bei regulären `dependencies` warnt es auch nicht (nur unerfüllte `peerDependencies` meldet es). (1) Manifest und Lockfile driften auseinander, weil Dependabot `pnpm.overrides` nicht editieren kann → `pnpm overrides:check` / `overrides:fix`, läuft im `guards`-Job vor dem Install. (2) Das Override rutscht **unter** den Bereich, den ein Abhängiger in seinen `dependencies` ODER `peerDependencies` fordert → `pnpm overrides:ranges` (`scripts/check-override-ranges.mjs`), hängt am `typecheck`-Job, weil es `node_modules` braucht. Fall 2 trifft Paketfamilien, die gemeinsam versioniert sind und einzeln in den Overrides stehen (`@assistant-ui/*`, `@tiptap/*`, `@blocknote/*`): Dependabot hebt das eine Paket, die Geschwister-Pins bleiben stehen — und weil der alte Caret die alte Version weiterhin erlaubt, merkt es niemand bis der Bundler mit `MISSING_EXPORT` abbricht. **Ein Override einer Familie nie allein heben.** Bewusste Rückwärts-Pins (zod 3, `@expo/dom-webview`, `http-proxy-middleware`) stehen mit Begründung in `DELIBERATE` im Check. **Was Fall 2 NICHT sieht: eine installierte Version, die im Bereich liegt und die API trotzdem bricht** — die Ausfallart von #2807 (`@qdrant/js-client-rest@1.19` erfüllte mem0s `^1.18.0` und hatte `search()` gestrichen). Ein Versionsvergleich kann das bauartbedingt nicht; dagegen hilft nur ein Rauchtest, der den echten Fremdcode gegen das echte Objekt fährt (so stand `apps/api/services/mem0/qdrantSearchCompat.vitest.ts`, bis mem0 am 01.09.2026 durch das explizite Gedächtnis in `services/memory/` ersetzt wurde). Der Kopfkommentar des Checks führt die Nähte, an denen wir einem Fremdpaket ein lebendes Objekt hereinreichen.

**Eine dritte Ausfallart hat gar keinen Check: ein Override kann die verlangte Node-Version heben.** `"undici": ">=8.9.0"` löst auf `undici@8.10.0` auf, das `engines: {node: '>=22.19.0'}` deklariert und `worker_threads.markAsUncloneable` ruft — während `apps/web`, `apps/gruen-o-mat` und `services/hocuspocus` noch auf `node:20` bauten (#2918, behoben in #2923). **pnpm erzwingt `engines` nicht**: der Install bleibt grün, der Bruch kommt erst beim *Laden* und steht dann mehrere `[cause]`-Ebenen tief als `webidl.util.markAsUncloneable is not a function`. Weder `overrides:check` noch `overrides:ranges` sieht das — beide vergleichen Versionsbereiche untereinander, keiner hält `engines` gegen die Base-Images. **Wer ein Override hebt, das eine Laufzeit-API mitbringt, greppt `FROM node:`**: die Docker-Base-Images sind die einzige Stelle, an der die Node-Version im Repo wirklich festgelegt wird (alle CI-Lanes fahren `setup-node 22`, sie werden also nie rot davon). Zwei Fallen dabei: ein grüner Bild-Build beweist hier nichts, weil die `pnpm install`-Schicht praktisch immer `CACHED` ist (in Run 33008138746 in allen drei Jobs — der Install lief dort auf node:20 gar nicht); und ein `engines`-Eintrag im Wurzel-Manifest plus `engine-strict=true` **würde** greifen (gemessen: `pnpm install` bricht auf node:20 mit Exit 1 und „Expected version: >=22, Got: v20.20.2" ab), ist aber wegen der ungeprüften Nebenwirkungen auf `apps/mobile` bewusst nicht eingebaut.

**Eine vierte Ausfallart trifft nicht die Version, sondern den Peer-Suffix.** Ein Caret-Override lässt zwei Versionen desselben Peers im Lockfile stehen, wenn ein Teil-Refresh nur einen Teilbaum neu auflöst — 28.08.2026 stand `@types/node` auf 26.2.0 für `apps/api` und auf 26.3.0 für `packages/contracts` und `packages/shared`, beide innerhalb von `"^26.2.0"`. Pakete, die diesen Peer **optional** deklarieren, bekommen dann pro Variante ein eigenes Verzeichnis: zwei physische Kopien **derselben** Version. Bei `@ts-rest/core` sind `ContractNoBody` und `ContractPlainType` `unique symbol`s, jede Kopie ist also ein eigener Typ — der API-Docker-Build starb in **jedem** Router mit `c.noBody()` bzw. `c.type<T>()` an `Type 'unique symbol' is not assignable to type 'ContractAnyType | unique symbol'` (Run 33132056074, 248 Fehler aus einer Ursache). **Es braucht dafür zwei Änderungen, und keine bricht allein:** #2974 stellte den Builder am selben Abend von `node-linker=hoisted` auf `--node-linker=isolated --shamefully-hoist` um (Bildbau von ~1 h auf Minuten) — erst der isolierte Linker legt Peer-Varianten als getrennte Verzeichnisse an; der hoisted Linker hätte sie zu einer Kopie eingeschmolzen. Deshalb war #2974 grün und erst der nächste Build nach #2809 rot. Weder `overrides:check` noch `overrides:ranges` sieht das, beide vergleichen Bereiche und keiner Suffixe; lokal bleibt es unsichtbar, weil die `.npmrc` weiter `hoisted` sagt. Deshalb prüft `check-singleton-versions.mjs` für die Liste `TYPE_IDENTITY` die **volle** aufgelöste Version samt Klammern. Gepinnt wird der gespaltene Peer — `"@types/node": "26.3.0"` exakt in `pnpm.overrides`, wie bei jsdom —, nicht das Paket, das daran zerbricht.

**Knip** (`pnpm knip`, nicht in CI) findet toten Code — die Entry-Punkte in `knip.json` sind load-bearing: was knip nicht als Entry kennt, sieht es als „unbenutzt" und alles darunter gleich mit. Dynamisch geladene Dateien müssen deshalb explizit als Entry stehen (`apps/mobile/app/**` kommt aus dem Expo Router; Web-Worker unter `apps/web/src/services/*.worker.ts`). Tests/Skripte gehören als **Entry** eingetragen, nicht in `ignore` — sonst zählen ihre Importe nicht als Nutzung und die Deps, die nur sie brauchen, gelten als unbenutzt. `apps/desktop` (Tauri-Wrapper) und `apps/wordpress` (Einstiege liegen in PHP) sind bewusst per `ignoreWorkspaces` ausgenommen.

**Cache-Soundness in `turbo.json` — die `^`-Kanten sind load-bearing, nicht kosmetisch.** Turbo hasht für einen Task nur die **eigenen** Dateien seines Pakets plus die Hashes der per `dependsOn` verketteten Tasks. Unsere Pakete lesen sich aber gegenseitig über tsconfig-`paths` **im Quelltext** (`apps/web/tsconfig.json` bildet `@gruenerator/shared` auf `../../packages/shared/src` ab, es gibt keine Project References). Ohne `^`-Kante fällt der Hash eines Konsumenten deshalb nicht aus, wenn sich die Quelle seiner Abhängigkeit ändert — Turbo liefert einen Cache-Treffer und ein echter Typfehler bleibt still grün. Gemessen am `web#typecheck`-Hash gegen eine Änderung in `packages/shared`: mit `^typecheck` `e0c91092…` → `7c2d8ba7…`, ohne die Kante zweimal `0d31e29f…`.

Konsequenzen:

- `typecheck` **und** `lint` tragen `dependsOn: ["^typecheck"]`. Bei `lint` sieht die Kante falsch aus, ist es aber nicht: ESLint läuft hier voll typ-bewusst (`projectService` + `no-floating-promises`/`no-unsafe-*` in `packages/eslint-config/base.js`) und liest dieselben fremden Quellen. `^lint` genügt nicht, weil die Hälfte der Zwischenpakete (`canvas-editor`, `collab`, `docs`, `presentations`, `sheets`, `voice`, `wolke`, `sites-design`) gar kein `lint`-Skript hat und die Hash-Kette dort abreißen würde — `typecheck` haben sie alle.
- Wer eine `^`-Kante entfernen will, weil sie „nur serialisiert": vorher den Hash messen (`turbo run <task> --dry=json`, Feld `hash`), nicht bloß prüfen, ob der Task isoliert grün läuft. `--only` beweist nur, dass die Reihenfolge egal ist, nichts über die Korrektheit des Caches.

**Check-Budget.** Auf einem M5/10 Kerne kostet ein kalter Voll-Typecheck ~64 s, ein kalter Voll-Lint ~287 s (`web` 287 s, `api` 281 s, `mobile` 236 s dominieren), die Testsuite ~114 s, `format:check` warm ~4 s (Prettier cacht mit `--cache --cache-strategy content`). Der Engpass ist aber nicht die Zeit, sondern der Speicher: bei ~5 parallelen Agenten auf 16 GB gilt:

- Während der Arbeit paketweise: `pnpm --filter @gruenerator/<pkg> exec tsc --noEmit`, `npx eslint <dateien>`, `npx vitest run <eine.vitest.ts>`.
- **`pnpm run ci` gar nicht — auch nicht einmal am Ende.** Das Skript ist `check:internal && check:overlays && turbo run typecheck lint test && format:check`: der mittlere Teil fährt typecheck, lint und Tests in **einem** Turbo-Aufruf gleichzeitig hoch. Bei ~5 parallelen Agenten auf 16 GB ist das der zuverlässigste Weg in den Swap, und der OOM-Abbruch sieht hinterher aus wie ein Testfehler. Stattdessen die Schritte **einzeln nacheinander**, jeder abgewartet, bevor der nächste startet:

  ```bash
  pnpm check:internal && pnpm check:overlays   # ~5 s, nicht weglassen
  pnpm typecheck                                # turbo, --concurrency=3
  pnpm lint
  pnpm test
  pnpm format:check
  ```

  Wo `--filter <pkg>` reicht, weil nur ein Paket berührt ist, ist es die bessere Wahl.

  Ein grüner Lokal-Lauf beweist ohnehin weniger, als er aussieht: der `Guards`-Job der CI fährt neun Skripte, von denen diese Liste nur zwei kennt. Die Entscheidung fällt auf dem PR, auf einer Maschine, die niemand sonst benutzt — dorthin gehört der Voll-Lauf.

  (**Nie `pnpm ci`** ohne `run` — das ist ein pnpm-Builtin, bricht mit `ERR_PNPM_CI_NOT_IMPLEMENTED` ab und liefert dabei Exit-Code 0: sieht aus wie grün, hat nichts geprüft.)

- Nie ganze Test-Verzeichnisse (`vitest run routes/chat agents/langgraph …` = 113 Dateien / 275 s / ~9 Forks).
- `--force` nur nach Änderungen an Build-Outputs geteilter Pakete, dann mit `--filter`. Nie als Reflex am Ende.

### Frontend component testing

`apps/web` and `packages/chat` have a jsdom vitest lane (`*.vitest.tsx`) running **alongside** the fast node lane (`*.vitest.ts`) — never flip the whole config to jsdom. Pick the tool by component shape: **RTL** for render/branching/interaction, **MSW** for `getContractsClient()` data hooks (success/error/empty branches), **axe** (`axe` from `test-utils`) wherever `aria-*`/`role=` is hand-written. Full guide, reference tests, the component→tool matrix, and the load-bearing gotchas (react aliased + react-query inlined in the dom project) live in **`apps/web/CLAUDE-testing.md`** — read it before adding component tests. jsdom is pinned exactly in `pnpm.overrides` (now `30.0.1`, was `26.1.0` while jsdom 29 broke against the `undici >=8.5.0` override) so the three vitest lanes and jest-expo's `jest-environment-jsdom` share one copy — a bump therefore needs the override line too, see `pnpm overrides:fix`.

### Newsletter

See `docs/CLAUDE-newsletter.md`. Landesverband notebooks: see `docs/CLAUDE-landesverband.md`.

## Deployment

See `docs/CLAUDE-deployment.md` for Docker images, test/prod environments, deploying steps, and shared package checklist.
