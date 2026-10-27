# „Website erkunden" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Chat-Werkzeug `website_erkunden`, das einen echten Browser (browser-use) eine Seite erkunden und Screenshots speichern lässt, live sichtbar in der Artefakt-Sidebar.

**Architecture:** Neuer Python-Dienst `services/browser-agent` (FastAPI + browser-use + Chromium hinter filterndem Egress-Proxy) streamt Schritte als NDJSON. Seine Modellaufrufe gehen über einen OpenAI-kompatiblen Endpunkt der API zurück in `services/ai/generate.ts` (Lane `browser_agent`). Das API-Werkzeug reicht Schritte als SSE `browser_session_start/update` an den Web-Client, der sie im `ArtifactPanel` mit dem assistant-ui-Element „Computer Use" zeigt.

**Tech Stack:** Python 3.13, FastAPI, browser-use **0.13.14 (exakt)**, Chromium (Playwright-Python-Image); Express 5, AI SDK-Fassade, Zod/contracts; React 19, Zustand, assistant-ui 0.15.

**Spec:** `docs/superpowers/specs/2026-10-27-website-erkunden-design.md` (gitignored — mit `git add -f` committen)

## Global Constraints

- browser-use exakt `0.13.14`; Agent mit `use_vision='auto'` (sonst entfernt browser-use `screenshot`, `agent/service.py:319-325`) und `Tools(exclude_actions=['save_as_pdf'])`.
- Kein Modell-Key im Dienst. Modell nur über die API-Lane `browser_agent` → `{ provider: 'melious', model: 'gemma-4-31b:speed', structuredMode: 'tool' }`. Denken aus erledigt `meliousThinkingFetch.ts` bereits (`reasoning_effort: 'none'` wenn nicht gesetzt).
- *Abweichung vom Spec, Entscheidung Claude:* Rückfall läuft über die normale Failover-Kette der Fassade (`laneFallback` → cortecs, mistral) pro Aufruf, nicht als Modellwahl beim Laufstart — „ein Weg zum Modell" sticht.
- `max_steps` 25, Laufdeckel im Dienst 170 s, Werkzeug-Timeout in der API 180 s.
- Telemetrie aus: `ANONYMIZED_TELEMETRY=false`, `BROWSER_USE_CLOUD_SYNC=false`.
- Regel-Text (wörtlich, `extend_system_message`):
  ```
  SCREENSHOTS: Ein Screenshot gilt nur dann als gemacht, wenn du die Aktion `screenshot` MIT `file_name` aufrufst.
  Das Bild, das du bei jedem Schritt siehst, ist KEIN gespeicherter Screenshot. Behaupte nie, einen Screenshot
  gemacht zu haben, ohne `screenshot` mit `file_name` aufgerufen zu haben.
  COOKIE-BANNER: Lehne Cookies immer ab (z. B. "Ablehnen", "Nur notwendige", "Alles ablehnen"). Akzeptiere nie
  Cookies und entferne Banner nie per JavaScript.
  SICHERHEIT: Sende keine Formulare ab, kaufe nichts, melde dich nirgends an. Nur lesen, suchen, navigieren.
  ```
- Gesperrte Adressbereiche im Proxy = Stand von `isPrivateAddress` nach PR #5011 (IPv4 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16, 224/3; IPv6 ::/96, fc00::/7, fe80::/10, fec0::/10, ff00::/8; IPv4-mapped geprüft als IPv4) plus Env `BROWSER_EGRESS_EXTRA_BLOCKED` (kommagetrennte IPs/CIDRs).
- GitHub-Texte Englisch, Conventional Commits klein; Repo-Doku/UI Deutsch; TypeScript ohne `undefined`, `import { type X }`.
- Checks paketweise (`pnpm --filter … exec tsc --noEmit`, `npx vitest run <datei>`), nie `pnpm run ci`.

## Review Focus

1. **Redirect auf interne Adresse** (öffentliche URL → 302 → `http://169.254.169.254/`): Browser bekommt Fehlerseite, Lauf läuft weiter → Test in Task 1.
2. **Abbruch durch Nutzer*in mitten im Lauf** (Stop-Knopf / Tab zu): Chromium-Prozess im Dienst endet, kein weiteres Melious-Token → Test in Task 2 und Task 6.
3. **Melious/Fassade wirft für einen Schritt** (`AiProviderError`): Endpunkt antwortet OpenAI-förmig mit 502 statt nacktem 500, browser-use zählt es als Fehlschritt → Test in Task 4.
4. **Zwei Screenshots mit gleichem `file_name`**: beide bleiben (zweiter mit Suffix), gezählt werden 2 → Test in Task 2.
5. **Reload während eines laufenden Laufs**: Karte zeigt „lief noch / abgebrochen" statt ewiger Lauf-Animation → Test in Task 9.

---

## PR 1 — Dienst `services/browser-agent`

### Task 1: Gerüst + filternder Egress-Proxy

**Files:**
- Create: `services/browser-agent/pyproject.toml`, `requirements.txt` (gepinnt), `requirements-dev.txt`, `README.md`
- Create: `services/browser-agent/src/browser_agent/egress.py`
- Test: `services/browser-agent/tests/test_egress.py`

**Interfaces:**
- Produces: `is_blocked(ip: str, extra: list[ipaddress._BaseNetwork]) -> bool`; `async start_egress_proxy(host: str, port: int, extra_blocked: list[str]) -> asyncio.AbstractServer` — HTTP-Forward-Proxy mit `CONNECT`; löst DNS selbst auf, prüft **jede** aufgelöste Adresse vor dem Verbinden, antwortet sonst `403`.

- [ ] **Step 1: Failing tests**
```python
@pytest.mark.parametrize("ip", ["169.254.169.254","10.0.0.1","100.64.0.1","127.0.0.1","::1","fd12::1","fe90::1","::ffff:a9fe:a9fe","::"])
def test_blocks_private(ip): assert is_blocked(ip, [])
@pytest.mark.parametrize("ip", ["8.8.8.8","2001:4860:4860::8888","100.128.0.1"])
def test_allows_public(ip): assert not is_blocked(ip, [])
def test_extra_blocked(): assert is_blocked("203.0.113.7", [ipaddress.ip_network("203.0.113.0/24")])
async def test_proxy_refuses_connect_to_private(proxy):  # CONNECT 127.0.0.1:443 → 403
async def test_proxy_refuses_name_resolving_private(proxy, monkeypatch):  # getaddrinfo → 10.0.0.5 → 403
async def test_proxy_forwards_public(proxy, local_public_stub):  # stub via monkeypatched resolver
```
- [ ] **Step 2:** `cd services/browser-agent && pytest tests/test_egress.py -v` → FAIL (import)
- [ ] **Step 3:** Implement `egress.py` mit `ipaddress` (IPv4-mapped über `.ipv4_mapped` normalisieren); Proxy auf `asyncio.start_server`, nur `CONNECT` und absolute-form `GET/POST/…`; Verbindung zur **geprüften IP**, nicht erneut zum Namen (kein DNS-Rebinding).
- [ ] **Step 4:** pytest → PASS
- [ ] **Step 5:** Commit `feat(browser-agent): add egress proxy that blocks private address ranges`

### Task 2: Lauf — browser-use konfigurieren, Schritte streamen, Dateien zählen

**Files:**
- Create: `services/browser-agent/src/browser_agent/run.py`, `events.py`, `api.py`
- Test: `services/browser-agent/tests/test_run.py`, `tests/test_api.py`

**Interfaces:**
- Consumes: Task 1 Proxy (läuft im selben Prozess auf `127.0.0.1:8899`, Chromium mit `--proxy-server=http://127.0.0.1:8899`, `--proxy-bypass-list=<-loopback>`, `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`).
- Produces (HTTP, Header `X-Browser-Agent-Secret: $BROWSER_AGENT_SECRET`):
  - `POST /runs` Body `{run_id: str, task: str, start_url: str, llm_base_url: str, llm_token: str, max_steps: int = 25}` → `application/x-ndjson`, je Zeile eines von:
    - `{"type":"step","n":int,"url":str,"title":str,"action":str,"target":str|null,"x_pct":float|null,"y_pct":float|null,"thought":str|null,"screenshot_jpeg_b64":str}`
    - `{"type":"screenshot_saved","file_name":str,"png_b64":str}`
    - `{"type":"done","summary":str,"agent_says_success":bool|null,"saved":[str],"steps":int,"seconds":float}`
    - `{"type":"error","message":str}`
  - `DELETE /runs/{run_id}` → bricht Lauf ab (204). Client-Disconnect auf dem Stream bricht ebenfalls ab.
  - `GET /health`.
- Fixe Konfiguration in `build_agent(...)`: `ChatOpenAI(model='browser_agent', base_url=llm_base_url, api_key=llm_token, timeout=120.0)`, `use_vision='auto'`, `Tools(exclude_actions=['save_as_pdf'])`, `extend_system_message=RULES` (Global Constraints), frisches `user_data_dir` je Lauf (danach löschen), headless.

- [ ] **Step 1: Failing tests**
```python
def test_agent_config(tmp_path):
    a = build_agent(task="x", start_url="https://example.org", llm_base_url="http://x", llm_token="t", workdir=tmp_path)
    assert a.settings.use_vision == 'auto'
    assert 'save_as_pdf' not in a.tools.registry.registry.actions
    assert 'screenshot' in a.tools.registry.registry.actions
    assert RULES in a.settings.extend_system_message
def test_saved_counts_disk_not_registry(tmp_path):  # zwei PNGs auf Platte, Register leer → saved == beide
def test_duplicate_file_name_kept(tmp_path):  # unique_png_name("a.png", existing={"a.png"}) == "a (1).png"
def test_click_position_pct():  # step_event_from(state, model_output) mit rect(100,50,20,10), viewport 1000x500 → x_pct 11.0, y_pct 11.0
async def test_disconnect_cancels_run(client, fake_agent):  # Stream-Abbruch → fake_agent.stop() gerufen, Profil-Dir weg
def test_requires_secret(client): assert client.post("/runs", json={...}).status_code == 401
async def test_busy_returns_429(client, fake_agent, monkeypatch):  # BROWSER_MAX_PARALLEL=1, zweiter Lauf parallel → 429
```
- [ ] **Step 2:** pytest → FAIL
- [ ] **Step 3:** Implement. Schritte über `register_new_step_callback(state, model_output, n)`; Screenshot aus `state.screenshot` auf Breite 1024 als JPEG (q=70, Pillow). Klickposition: Index der ersten `click`-Aktion → `state.dom_state.selector_map[idx].absolute_position`, relativ zum Viewport, sonst `null`. Dateien: nach jedem Schritt `fs/**/*.png` scannen, neue als `screenshot_saved` senden; Kollisionen per Wrapper um die `screenshot`-Aktion auf `unique_png_name`. Laufdeckel 170 s per `asyncio.wait_for`.
- [ ] **Step 4:** pytest → PASS
- [ ] **Step 5:** Commit `feat(browser-agent): stream browser-use steps and count saved screenshots on disk`

### Task 3: Image, CI, Eval-Skript

**Files:**
- Create: `services/browser-agent/Dockerfile` (Basis `mcr.microsoft.com/playwright/python:<exakt gepinnter Tag>`, venv unter `/opt/venv` wie `services/nlp/Dockerfile`, `HEALTHCHECK` auf `/health`, Port 8000, nicht-root)
- Create: `services/browser-agent/evals/run_matrix.py` (die drei Spike-Aufgaben × 2, druckt PNG-Zahl je Lauf und „Alles ablehnen"-Klicks; manuell, nicht in CI)
- Create: `.github/workflows/browser-agent-image.yml` (nach `nlp-image.yml`), Modify: `.github/workflows/build-images.yml` (Job + Pfadfilter wie nlp, Image `${IMAGE_PREFIX}-browser-agent`), CI-Job „Browser Agent (Python)" mit pytest
- Modify: `scripts/check-internal-content.mjs` nur falls nötig (nicht erwartet)

- [ ] **Step 1:** `docker build -t gr-browser-agent services/browser-agent` → baut
- [ ] **Step 2:** Container starten, `curl localhost:8000/health` → 200; im Container `python -c` mit Chromium über den Proxy `http://169.254.169.254/` → Fehlerseite/403, `https://example.org` → 200
- [ ] **Step 3:** Commit `ci(browser-agent): build image and run python tests`

## PR 2 — API

### Task 4: Lane + OpenAI-kompatibler Modell-Endpunkt

**Files:**
- Modify: `apps/api/services/ai/lanes.ts` (Zeile `browser_agent`)
- Create: `apps/api/services/browserAgent/runToken.ts`
- Create: `apps/api/routes/browserAgent/llmProxyRouter.ts`; Modify: `apps/api/routes.ts` (mount `/api/browser-agent/llm`, **nicht** unter `/api/internal`)
- Test: `apps/api/services/browserAgent/runToken.vitest.ts`, `apps/api/routes/browserAgent/llmProxyRouter.vitest.ts`

**Interfaces:**
- Produces: `signRunToken({ runId: string; userId: string; expiresAt: number }): string`, `verifyRunToken(token: string): { runId: string; userId: string } | null` (HMAC-SHA256 mit `BROWSER_AGENT_SECRET`, `timingSafeEqual`, Vorbild `services/search/imageProxySignature.ts`, Ablauf 10 min).
- Produces: `POST /api/browser-agent/llm/v1/chat/completions` (Bearer = Run-Token) → OpenAI-Chat-Completion `{id, object:'chat.completion', model:'browser_agent', choices:[{index:0, message:{role:'assistant', content}, finish_reason:'stop'}], usage}`. Intern: `runWithUsageContext({ req: { user: { id: userId } }, feature: 'chat' }, () => aiText({ lane: 'browser_agent', messages, json: hasResponseFormat, maxOutputTokens: body.max_completion_tokens ?? 4096, timeoutMs: 75_000 }))`. Wenn `response_format.json_schema` gesetzt: Schema als System-Zusatz vor `messages` (browser-use validiert das JSON selbst).

- [ ] **Step 1: Failing tests**
```ts
it('round-trips a token', () => { const t = signRunToken({ runId: 'r', userId: 'u', expiresAt: Date.now() + 1000 }); expect(verifyRunToken(t)).toEqual({ runId: 'r', userId: 'u' }); });
it('rejects tampered / expired tokens', …);
it('401 without valid bearer', …);
it('passes image_url parts and json flag to aiText on lane browser_agent', …); // aiText gemockt, prüft call.lane, call.json, messages[1].content[1].type === 'image_url'
it('maps AiProviderError to 502 with OpenAI error body', …);
it('runs aiText inside usage context of the token user', …); // getUsageUserId() im Mock === 'u'
```
- [ ] **Step 2:** `cd apps/api && npx vitest run services/browserAgent/runToken.vitest.ts routes/browserAgent/llmProxyRouter.vitest.ts` → FAIL
- [ ] **Step 3:** Implement; `BROWSER_AGENT_SECRET`, `BROWSER_AGENT_URL` in `config/env.ts` (optional).
- [ ] **Step 4:** Tests → PASS; außerdem `npx vitest run services/ai/__tests__/lanes.vitest.ts` grün (Paritätsprüfung — falls sie die neue Lane in `providerSelector.ts` verlangt, dort spiegeln).
- [ ] **Step 5:** Commit `feat(api): add browser_agent lane and openai-compatible endpoint for the browser service`

### Task 5: Client zum Dienst

**Files:**
- Create: `apps/api/services/browserAgent/browserAgentClient.ts`
- Test: `apps/api/services/browserAgent/browserAgentClient.vitest.ts`

**Interfaces:**
- Produces: `type BrowserAgentEvent` (Zod-Union exakt wie Task 2 NDJSON), `runBrowserAgent(input: { runId: string; userId: string; task: string; startUrl: string; signal: AbortSignal }): AsyncIterable<BrowserAgentEvent>` — POST an `${BROWSER_AGENT_URL}/runs` mit `llm_base_url = ${API_INTERNAL_BASE_URL}/api/browser-agent/llm/v1` und `llm_token = signRunToken(...)`; Abbruch des `signal` schließt den Stream; ungültige Zeilen werden geloggt und übersprungen.

- [ ] **Step 1: Failing tests** — MSW/undici-Mock liefert 3 NDJSON-Zeilen inkl. einer kaputten → Iterator liefert 2 Events; `signal.abort()` → Fetch abgebrochen; Dienst 429 → wirft `BrowserAgentBusyError`.
- [ ] **Step 2–4:** FAIL → implement → PASS
- [ ] **Step 5:** Commit `feat(api): add streaming client for the browser agent service`

### Task 6: Werkzeug `website_erkunden` + SSE + Metadaten

**Files:**
- Modify: `packages/contracts/src/schemas/chatStreamEvents.ts` (`browserSessionStepSchema`, `browserSessionStartSchema`, `browserSessionUpdateSchema`, `browserSessionMetaSchema`)
- Modify: `apps/api/routes/chat/services/sseHelpers.ts` (`SSEEventType` + `SSEEventPayloads`)
- Create: `apps/api/routes/chat/agents/browserAgentTool.ts`; Modify: `apps/api/routes/chat/agents/toolCatalog.ts` (montieren, wenn `env.BROWSER_AGENT_URL` gesetzt und `webAllowed && !researchBanned`)
- Modify: `apps/api/routes/chat/services/agenticLoop/toolScope.ts` (neue `DEFERRABLE_GROUPS`-Gruppe `website` mit Lader `website_werkzeug_laden`, Hint-RegEx auf „erkunde|klick|screenshot|bildschirmfoto|durchsuch.*(seite|website)")
- Modify: `apps/api/routes/chat/services/agenticLoop/types.ts` (`TOOL_TIMEOUT_OVERRIDES_MS.website_erkunden = 180_000` mit Begründungszeile)
- Modify: `apps/api/config/rateLimits.ts` (Ressource `browser_agent`: 10/Stunde je Nutzer*in)
- Modify: Persistenz der Nachricht (`GrueneratorMessageMetadata.browserSession`, dort wo `generatedImage` geschrieben wird, `chatGraphContractRouter.ts` / `messagesController.ts`)
- Test: `apps/api/routes/chat/agents/browserAgentTool.vitest.ts`; bestehende `toolScopeBudget.vitest.ts`, `toolCatalogUiCoverage.vitest.ts` müssen grün bleiben

**Interfaces:**
- Consumes: Task 5 `runBrowserAgent`, `storeBinaryAsset(userId, buffer, 'jpg'|'png')`, `validateUrlForFetch`, `loop.sse`.
- Produces: Werkzeug-Input `{ url: string; auftrag: string; screenshots_erwartet?: number }`; Ergebnis `{ summary: string; screenshots: Array<{ name: string; url: string }>; fehlend: number; schritte: number; abgebrochen: boolean }`.
- Produces SSE: `browser_session_start {id, url, title}`; `browser_session_update {id, step?: BrowserSessionStep, screenshot?: {name, url}, status?: 'running'|'done'|'failed', summary?: string}`; `BrowserSessionStep = {n, url, title, action, target: string|null, xPct: number|null, yPct: number|null, thought: string|null, imageUrl: string}`.
- Produces Metadaten: `custom.browserSession = {id, startUrl, status, steps: BrowserSessionStep[], screenshots: [{name,url}], summary}`.

- [ ] **Step 1: Failing tests**
```ts
it('rejects private start url before calling the service', …); // validateUrlForFetch false → { error }, runBrowserAgent nie gerufen
it('emits start, one update per step with stored image url, and done', …);
it('reports fehlend when fewer screenshots than screenshots_erwartet', …); // erwartet 3, saved 1 → fehlend 2
it('aborts the service run when the loop signal aborts', …);
it('refuses with a German message when the rate limit is exhausted', …);
it('stores no base64 in metadata', …); // JSON.stringify(meta) enthält kein 'base64'/'b64'
```
- [ ] **Step 2–4:** FAIL → implement → PASS. Werkzeugbeschreibung Deutsch mit „NUTZE WENN:" (Seite bedienen: klicken, suchen, Banner, Screenshots; NICHT für reines Lesen einer URL → `scrape_url`).
- [ ] **Step 5:** `cd apps/api && npx vitest run routes/chat/services/agenticLoop/toolScopeBudget.vitest.ts routes/chat/agents/toolCatalogUiCoverage.vitest.ts` → grün (Coverage wird erst mit Task 9 grün — dann beide PRs zusammen mergen oder Task 9 vorziehen).
- [ ] **Step 6:** Commit `feat(chat): add website_erkunden tool with live browser session events`

## PR 3 — Web

### Task 7: Store + Stream-Parser

**Files:**
- Modify: `packages/chat/src/stores/artifactLiveStore.ts` (`BrowserSessionArtifact {id, type:'browser_session', title, startUrl, status, steps, screenshots, summary}` in `ActiveArtifact`, `upsertBrowserSession(id, patch)` — Schritte nach `n` mergen, Screenshots nach `name`)
- Modify: `packages/chat/src/runtime/GrueneratorModelAdapter/parseSSEStream.ts` (Fälle `browser_session_start`/`_update`, Abbruch → `failed` wie Research-Log `:127-129`), `packages/chat/src/types/messageMetadata.ts`
- Test: `packages/chat/src/stores/artifactLiveStore.vitest.ts` (bestehend erweitern), `parseSSEStream`-Test neben dem bestehenden

- [ ] **Step 1: Failing tests** — `upsertBrowserSession` merged Schritt `n=2` zweimal zu einem; Start-Event öffnet Panel nur bei `canAutoOpenArtifactPanel()`; Abort markiert laufende Session `failed`.
- [ ] **Step 2–4:** FAIL → implement → PASS (`npx vitest run <datei>` in `packages/chat`)
- [ ] **Step 5:** Commit `feat(chat): track live browser sessions in the artifact store`

### Task 8: Computer-Use-Element + Sidebar-Ansicht

**Files:**
- Create: `packages/chat/src/components/assistant-ui/elements/computer-use.tsx` (per `npx shadcn add @assistant-ui/computer-use` in `packages/chat`, Imports über `_adapter.tsx`; Kopfkommentar mit Anpassungen wie `tool-call.tsx:1-13`)
- Create: `packages/chat/src/components/BrowserSessionView.tsx`
- Modify: `packages/chat/src/components/ArtifactPanel.tsx` (Zweig + Badge „Browser"; Typ von `srcDoc`/Download `:92`/`:108` ausnehmen)
- Test: `packages/chat/src/components/BrowserSessionView.vitest.tsx` (RTL + axe)

**Interfaces:**
- Consumes: Task 7 `BrowserSessionArtifact`.
- Produces: `<BrowserSessionView artifact={BrowserSessionArtifact} />` — `ComputerUse url={letzter step.url} steps={steps mit x/y} activeIndex={steps.length-1}` mit `<img src={letzter step.imageUrl} alt={`Bildschirm: ${title}`}>`; darunter Schrittliste (`<ol>`, Aktion + Ziel), am Ende Galerie der Screenshots (Links öffnen das PNG).

- [ ] **Step 1: Failing tests** — rendert aktuelle URL und letzten Screenshot; Liste hat so viele `li` wie Schritte; `status='failed'` zeigt „Abgebrochen"; `axe` ohne Verstöße; leerer Lauf (0 Schritte) zeigt „Browser startet …".
- [ ] **Step 2–4:** FAIL → implement (Tokens/Regeln aus `docs/CLAUDE-styling.md`, `docs/CLAUDE-a11y.md`; Laufanimation respektiert `prefers-reduced-motion`) → PASS
- [ ] **Step 5:** Commit `feat(chat): show live browser sessions in the artifact panel`

### Task 9: Werkzeug-Karte + Wiederherstellen nach Reload

**Files:**
- Modify: `packages/chat/src/lib/toolRegistry.ts` (`UI_TOOL_NAMES` + `TOOL_REGISTRY` Eintrag `website_erkunden`), `packages/chat/src/lib/toolResults.ts` (`TOOL_METADATA`, Label „Website erkunden", Icon `globe`)
- Create: `packages/chat/src/components/tool-ui/BrowserSessionCard.tsx`; Modify: `GrueneratorToolUIs.tsx` (`DEDICATED_RENDERS`)
- Test: `packages/chat/src/components/tool-ui/BrowserSessionCard.vitest.tsx`

- [ ] **Step 1: Failing tests** — Karte zeigt Start-URL, Schrittzahl, Galerie; „Ansehen" ruft `setActiveArtifact` mit Daten aus `custom.browserSession`; Session aus Metadaten mit `status='running'` (Reload mitten im Lauf) wird als „abgebrochen" gezeigt.
- [ ] **Step 2–4:** FAIL → implement → PASS; dazu `cd apps/api && npx vitest run routes/chat/agents/toolCatalogUiCoverage.vitest.ts` grün
- [ ] **Step 5:** Lokal Ende-zu-Ende: Dienst-Container + `pnpm dev:backend` + `pnpm dev:web`, im Chat „Erkunde https://www.stadt-muenster.de und mach Screenshots der Startseite und der Klimaschutz-Seite" → Sidebar öffnet, Schritte laufen ein, 2 PNGs in der Karte, Reload stellt die Ansicht wieder her.
- [ ] **Step 6:** Commit `feat(chat): add browser session card that reopens the live view`

## PR 4 — Salt (Branch `gruenerator-videoeditor`, Worktree `~/Salt/videoeditor`)

### Task 10: Container, Netz, Env

**Files:**
- Modify: `states/gruenerator-docker/files/docker-compose.yml.j2` (Dienst `browser-agent` zeichengleich zum Muster `nlp`, Image `ghcr.io/netzbegruenung/gruenerator-browser-agent:${TAG:-latest}`, nur Netz `gruenerator-browser`, kein `extra_hosts`; `api` zusätzlich an `gruenerator-browser`; Netz-Definition; Env `BROWSER_AGENT_SECRET`, `BROWSER_EGRESS_EXTRA_BLOCKED` = Host-IPs + Qdrant-Host)
- Modify: `states/gruenerator-docker/files/backend.env.j2` (`BROWSER_AGENT_URL=http://browser-agent:8000`, `BROWSER_AGENT_SECRET` aus Passbolt-UUID im Pillar, `API_INTERNAL_BASE_URL=http://api:3001`)
- Modify: `states/gruenerator-docker/init.sls` (Dienstliste im Kopf)

- [ ] **Step 1:** Änderungen ohne erklärende Kommentare (Konvention `salt-repo-conventions`)
- [ ] **Step 2:** `SKIP=no-commit-to-branch pre-commit run --all-files` in einer venv → grün
- [ ] **Step 3:** Commit auf `gruenerator-videoeditor`, Betreff `Gruenerator: add browser agent container`, Rumpf beginnt mit `- `; Push; Salt-PR (Gitea-API) bzw. bestehenden PR um den Commit ergänzt
- [ ] **Step 4:** Moritz Bescheid geben: Passbolt-Eintrag `BROWSER_AGENT_SECRET` anlegen, UUID im Pillar

## Reihenfolge und PRs

PR 1 → PR 2 (Task 4–6) → PR 3 (Task 7–9) → PR 4. PR 2 und PR 3 gestapelt (Task 6 braucht die UI-Registry aus Task 9 für den Coverage-Test). Prod-Rollout erst nach Merge von #5011 und dem Passbolt-Eintrag.
