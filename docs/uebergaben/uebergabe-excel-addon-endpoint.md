# Übergabe: OpenAI-kompatibler Endpoint für das Excel-Add-in

**Stand:** 31.07.2026 · Repo: `/Users/moritzwachter/Gruenerator` (apps/api) · Der Client liegt separat in `/Users/moritzwachter/gruenerator-excel`.

## Auftrag in einem Satz

Baue `POST /api/v1/chat/completions` als **minimalen Durchreiche-Endpoint** zu verdigado/LiteLLM — nur Modellzugriff, kein ChatGraph, keine Tools, keine Intent-Klassifikation, keine Notebooks.

## Warum das gebraucht wird

Ein geforktes Office-Excel-Add-in (`~/gruenerator-excel`, Fork von tmustier/pi-for-excel, MIT) bringt seinen **eigenen Agent-Loop mit 20 Excel-Tools** mit. Es braucht von uns nichts als ein Modell hinter einer OpenAI-kompatiblen URL. Heute zeigt es direkt auf `https://litellm.netzbegruenung.verdigado.net/v1` — das funktioniert aus dem Browser aber nur über einen lokalen CORS-Proxy, weil der nginx vor LiteLLM den **CORS-Preflight mit 401 beantwortet** (`OPTIONS` wird per Spec ohne Credentials gesendet). Verifiziert:

```
OPTIONS /v1/chat/completions  → 401, keine CORS-Header
POST    /v1/chat/completions  → 200, access-control-allow-origin gesetzt
```

Dieser Endpoint löst drei Dinge auf einmal: Preflight, Auth pro Nutzer:in statt geteiltem LiteLLM-Key, und den Wegfall des lokalen Proxy-Prozesses.

## Recherche-Ergebnisse (schon erledigt, nicht neu machen)

### Auth — nimm das bestehende `api_keys`-System, nicht Better Auth

- `apps/api/middleware/apiKeyMiddleware.ts:80` — `requireApiKey` prüft `Authorization: Bearer <key>` gegen `api_keys.key_hash` (SHA-256), respektiert `revoked_at`/`expires_at`, hängt `req.apiKey` an.
- `assertScope(ctx, 'chat:completions')` (`apiKeyMiddleware.ts:127`) funktioniert ohne Schemaänderung — Scopes liegen als JSONB.
- Vorbild in Produktion: `apps/api/routes/v1/notebooksRouter.ts:28-29`.
- Better Auth hat bereits `bearer()` aktiv (`apps/api/config/betterAuth.ts:538`), das macht aber nur die **Session** per Header ansprechbar — für einen headless Client ohne Login-Flow nutzlos. Das `apiKey`-Plugin ist **nicht** installiert und bräuchte ein eigenes npm-Paket, neue `ba_`-Tabellen und eine Migration. Für „minimal" unverhältnismäßig.

> **Entschieden am 31.07.2026 (Moritz): Schlüssel werden vorerst von Hand vergeben.** Es gibt keine UI und keinen Endpoint zum Anlegen; einziger Weg ist das CLI-Skript `apps/api/scripts/mintApiKey.ts` (`pnpm --filter @gruenerator/api mint-api-key --user <id> --label ...`), das den Klartext einmalig auf stdout ausgibt. Für den Piloten reicht das. **Kein Self-Service bauen** — das wäre Scope-Ausweitung. Falls es später doch kommt: als Sektion im Konnektoren-Tab (`apps/web/src/features/settings/tabs/ConnectorsTab.tsx`, wo `McpSection` und `CanvaSection` schon sitzen), per ts-rest-Contract, und mit **fest vergebenem** Scope — Nutzer:innen dürfen sich niemals selbst `notebooks:read` mit LV-Scope ausstellen.

### CORS — bei uns strukturell in Ordnung, eine Zeile fehlt

- `cors()` ist die **allererste** Middleware (`apps/api/server.ts:198-217`), lange vor `setupRoutes(app)` (Zeile 541). `preflightContinue` ist nicht gesetzt → die `cors`-Lib beantwortet OPTIONS selbst mit 204, bevor `requireApiKey` überhaupt erreicht wird. Das verdigado-Problem wiederholt sich hier also **nicht**.
- `Authorization` steht bereits in `allowedHeaders` (`apps/api/config/cors.ts:89`).
- **Zu tun:** `https://localhost:3141` (Dev-Port des Taskpanes) fehlt in der Dev-Origin-Liste — `apps/api/utils/domainUtils.ts:31-49`. Die produktive Taskpane-Domain kommt später in `apps/api/config/domains.ts` → `ALLOWED_DOMAINS`.

### Streaming — direkter fetch, nicht das AI SDK

Das ist die wichtigste technische Entscheidung, und sie ist belegt:

- `@ai-sdk/openai`s Chat-Completions-Schema kennt **kein `reasoning`-Feld**. LiteLLM/Ollama streamt bei `verdigado-think` die Denkschritte aber über `delta.reasoning` — das AI SDK verwirft sie kommentarlos. Genau deshalb existiert bei uns schon der handgeschriebene SSE-Parser `apps/api/services/ai/regoloReasoningStream.ts:111-180`.
- Für reines Durchreichen ist ein `fetch` gegen LiteLLM mit Byte-Pipe an `res` weniger Code **und** verlustfrei gegenüber Feldern, die wir nicht kennen. Der AI-SDK-Weg müsste erst in AI-SDK-Objekte und zurück in OpenAI-Delta-Form serialisieren.
- SSE-Header-Muster im Haus: `apps/api/routes/chat/services/sseHelpers.ts:454-461` — `text/event-stream`, `no-cache`, `keep-alive`, **`X-Accel-Buffering: no`**, dann `res.flushHeaders()`.
- `AbortSignal` von `req` an den Upstream-Fetch durchreichen (Muster: `regoloReasoningStream.ts:78,138`).

### Kein ts-rest

Der Body ist ein **fremdes** OpenAI-Schema, das wir nicht definieren, und die Antwort ist ein Stream. Die Contract-Pflicht aus `CLAUDE.md` zielt auf Endpoints, die unser eigenes typisiertes Frontend über `getContractsClient()` konsumiert. Die bestehenden v1-Router sind konsequenterweise reine Express-Router. Mach es genauso.

## Umsetzung

Reihenfolge:

1. **`apps/api/services/ai/litellmPassthrough.ts`** (neu) — `fetch` gegen `env.LITELLM_BASE_URL + '/v1/chat/completions'` mit `Authorization: Bearer ${env.LITELLM_API_KEY}`. Body 1:1 übernehmen, nur `model` gegen eine Allowlist prüfen. `AbortSignal` durchreichen. Response-Body roh zurückgeben.
2. **`apps/api/routes/v1/chatCompletionsRouter.ts`** (neu) — Express-Router nach Vorbild `notebooksRouter.ts`: `requireApiKey` → `apiKeyRateLimit('chat-completions')` → Scope-Check `chat:completions` → `POST /`. Bei `stream: true` SSE-Header setzen und pipen, sonst JSON 1:1 zurück.
3. **`apps/api/routes.ts`** — mounten neben Zeile 423/425: `app.use('/api/v1/chat/completions', v1ChatCompletionsRouter)`.
4. **`apps/api/utils/domainUtils.ts`** — `https://localhost:3141` in die Dev-Origins.
5. **Tests** — `chatCompletionsRouter.vitest.ts`: Auth-Reject ohne Key, Scope-Reject, Happy-Path non-stream, SSE-Passthrough mit gemocktem Fetch-Stream.

### Modell-Allowlist — nicht optional

Erlaube ausschließlich `verdigado-think`. Begründung: GPT-OSS (`verdigado-pro`) hat im Tool-Loop-Test zwei Enum-Verstöße produziert und Bereiche wie Formeln falsch gesetzt (siehe unten). Ein offener `model`-Parameter wäre außerdem ein Weg, unseren LiteLLM-Zugang für beliebige Modelle zu benutzen.

### Kontextfenster — 64k, nicht 128k

`CTX_VERDIGADO = 64_000` in `apps/api/routes/chat/agents/providers.ts:117`. Die Ollama-Lanes kürzen darüber **still** (gemessen: `prompt_tokens: 65538` bei ~350k Input, HTTP 200, keine Fehlermeldung). Wenn du im Endpoint eine Längenprüfung einbaust, nimm diesen Wert — und wirf lieber einen 400er, als eine Antwort auf einem Fragment auszuliefern.

## Fallen

- `env.LITELLM_API_KEY` ist `optional()` (`apps/api/config/env.ts:107`). `getLiteLLMProvider()` schickt ohne Key einen leeren Bearer los. **Im neuen Pfad hart prüfen und früh scheitern.**
- `apiKeyRateLimit` ist bei Redis-Fehlern **fail-open** (`apiKeyRateLimitMiddleware.ts:42-45`). Bei einem kostenpflichtigen LLM-Proxy bewusst zur Kenntnis nehmen.
- **Kein Prompt-Logging.** `morgan` loggt POST auf `/api/` ohnehin nicht (`server.ts:512`). Wenn du Langfuse-Tracing erwägst: Excel-Zellinhalte können Mitgliederdaten sein — das ist eine Datenschutzentscheidung, keine technische. Nicht ungefragt einschalten.
- Body-Parser-Limit ist global 50 MB (`server.ts:224`), reicht.
- Response-Timeout ist 15 Minuten (`serverConfig.ts:37`), reicht für SSE.
- Node läuft im Cluster-Modus; für einen einzelnen SSE-Request unproblematisch (bleibt in einem Worker).

## Danach: Client umstellen

Im Fork `~/gruenerator-excel` ist das **eine Konstante**: `GRUENERATOR_ENDPOINT_URL` in `src/gruenerator/config.ts`. Zusätzlich entfernen: der Aufruf `enableInterimProxy(settings)` in `src/taskpane/init.ts` samt Funktion in `src/gruenerator/gateway.ts` — beide tragen bereits einen Kommentar, dass sie mit diesem Endpoint entfallen.

## Belegte Vorarbeit, auf die du dich verlassen kannst

- verdigado ist OpenAI-kompatibel, kann Tool-Calling und Streaming (per curl verifiziert).
- Im mehrrundigen Tool-Loop-Test gegen gefakte Excel-Tools: **`verdigado-think` 3 Runden, 0 Schema-Verstöße**, Kopfzeile korrekt ausgeschlossen, parallele Tool-Calls. `verdigado-pro` 4 Runden, 2 Enum-Verstöße, falsche Bereiche und Formeln.
- Testskript liegt unter `scratchpad/loop-test.mjs` (nimmt das Modell als Argument).
