# Agentischer Tool-Loop im Chat — konkreter Follow-up-Plan

Status: **geplant, nicht begonnen.** Hintergrund: Beim Bau des Sharepic-Editings
(PR #1215) fiel die bewusste Entscheidung „structured call now, loop later" —
ein einzelner strukturierter LLM-Call pro Edit statt eines agentischen Loops.
Dieses Dokument macht das „later" konkret: Architektur, Phasen, Aufwand,
Risiken. Zahlen und Dateiverweise sind am echten Code verifiziert (Stand
2026-06-11).

## Verifizierte Ausgangslage

Was die Codebasis schon mitbringt (senkt den Aufwand erheblich):

- **Streaming läuft über das Vercel AI SDK v6.** `streamText()` in
  `apps/api/routes/chat/services/responseStreamingService.ts:325` — derzeit
  ohne `tools`-Parameter. Das SDK beherrscht Multi-Step-Tool-Loops nativ
  (`tools` + `stopWhen`/`stepCountIs`); der Loop muss NICHT handgeschrieben
  werden und läuft im API-Prozess. Der `aiWorkerPool` ist nur für
  Non-Streaming-Calls zuständig (Classifier, Canvas-Suggest) und bleibt
  unangetastet.
- **DB-Schema trägt Multi-Tool-Messages bereits.** `chat_messages.tool_calls`
  ist `jsonb[]`; nur die Persistenz-Logik (`postResponseService.ts`) schreibt
  heute maximal einen Tool-Call pro Assistant-Message.
- **Die Tool-Executors existieren als Services** mit sauberen Signaturen:
  `handleSharepicEdit`, `generateSharepicVariants`, `handleBoardCreation`,
  `generateAndCreateDocument`, `handleShareDoc`, `imageNode`/`imageEditNode`,
  `executeResearch`, Suche via `searchNode`. Zod-Schemas für viele Parameter
  liegen schon in `@gruenerator/contracts`.
- **HITL ist wiederverwendbar:** `pipelineStateStore` (Interrupt/Resume) +
  `pendingActionStore` + `POST /api/chat-service/confirm`.
- **Kontrast — was der Loop ablöst:** `chatGraphContractRouter.ts` (806 LOC)
  hat ~23 Intent-Branches/Sonderpfade; der Classifier kennt 18 Intents mit
  4-Tier-Heuristik. Jedes neue Feature wächst heute mit O(Branches), mit Loop
  mit O(Tools).

## Zielbild v1: gescoped auf den Sharepic-Modus

NICHT chat-weit starten. Der Sharepic-Modus (gedocktes Artifact-Panel,
`SharepicArtifactPanel`) liefert den idealen begrenzten Scope:

- Aktiviert nur, wenn `currentSharepic` gesetzt ist UND Feature-Flag an.
- Kleines Tool-Set (s. u.), klare UI-Fläche, klar abgegrenzter Fehlerradius.
- Alle anderen Intents laufen unverändert über die bestehende Pipeline —
  der Loop ist ein zusätzlicher Branch, kein Umbau.

### Tool-Set v1 (Sharepic-Modus)

| Tool | Executor (existiert) | Parameter-Schema |
| --- | --- | --- |
| `apply_sharepic_ops` | Kern von `handleSharepicEdit` (Ops → Patch → Version) | `canvasAiOperationSchema[]` (existiert) |
| `search_background_image` | `imagePickerService.selectBestImage` | `{ query }` (existiert als Op) |
| `generate_background_image` | Flux-Pfad aus dem image-Intent | `{ prompt }` |
| `read_sharepic_state` | `getCurrentCanvasState` + `buildSharepicSnapshot` | `{ }` (Ziel implizit) |
| `restore_version` | Restore-Pfad aus `canvasContractRouter` | `{ version }` |
| `create_variant` | `generateSharepicVariants` | `{ topic, templates? }` |

Damit gehen Mehrschritt-Anweisungen in EINEM Turn: „such ein passendes
Hintergrundbild, mach die Schrift größer und zeig mir das Ergebnis" =
`search_background_image` → `apply_sharepic_ops` → Antworttext.

## Architektur

### Neuer Service: `agenticResponseService.ts`

`apps/api/routes/chat/services/agenticResponseService.ts` (~400–500 LOC):

```
streamText({
  model,                      // bestehende Provider-Auswahl
  system: <Modus-Prompt + Snapshot + Capabilities>,
  messages,
  tools: buildToolRegistry(ctx),
  stopWhen: stepCountIs(MAX_STEPS),   // v1: 4
  onStepFinish: (step) => emitSseToolEvents(step),
})
```

- Pro Tool-Schritt: SSE `tool_step_start { toolName, args }` und
  `tool_step_result { toolName, summary }` (NUR kompakte Summaries über SSE
  an die UI; Sharepic-State reist weiter über die bestehenden
  `sharepic_updated`-Events aus den Executors).
- Harte Limits: max. 4 Steps, max. 1 `generate_background_image` pro Turn
  (Kosten), Timeout pro Tool 30 s, Gesamtbudget pro Turn.
- Fehlerpfad: Tool-Fehler wird als Tool-Result ans Modell zurückgegeben
  (Selbstkorrektur), nach 2 Fehlschlägen desselben Tools Abbruch mit
  verständlicher Antwort.

### Tool-Registry: `chatToolRegistry.ts`

`apps/api/routes/chat/services/chatToolRegistry.ts` (~300–400 LOC): wrappt
die existierenden Services als AI-SDK-Tools (`tool({ description,
inputSchema: zodSchema, execute })`). Gating analog `forcedTools`/
`enabledTools`: Registry wird pro Request aus Kontext (currentSharepic,
User-Locale, Flags) zusammengestellt. KEINE neue Berechtigungslogik — die
Executors prüfen Ownership bereits selbst (z. B. `getCanvas` vor Patch).

### Kontext-Disziplin (übernimmt die #1215-Regeln)

- Tool-Results im LLM-Kontext: nur kompakte Summaries (≤120 Zeichen) +
  Snapshot-Refresh via `read_sharepic_state` bei Bedarf — nie voller State.
- Persistiert wird wie heute: `tool_calls[]` mit kompakten Ergebnissen
  (`{ canvasId, variantId, version, summary }`), jetzt mehrere pro Message.
- Der Modus-Systemprompt wird pro Turn frisch gebaut (Snapshot des aktiven
  Sharepics), nie in die Message-History geschrieben.

### Persistenz & Frontend

- `postResponseService.ts`: Tool-Call-Liste aus den Loop-Steps befüllen
  (~150–200 LOC Anpassung; Schema-Änderung NICHT nötig).
- `sseHelpers.ts`: 2 neue Event-Typen (`tool_step_start`,
  `tool_step_result`), ~60 LOC.
- `parseSSEStream.ts` (753 LOC, ~35 Cases): 2 neue Cases, die Steps als
  ToolCallParts an die laufende Assistant-Message hängen (assistant-ui
  unterstützt mehrere ToolCallParts pro Message bereits); ToolCallUI um
  Step-Darstellung erweitern. ~250–400 LOC inkl. UI.

## Phasen

| Phase | Inhalt | Umfang | PR |
| --- | --- | --- | --- |
| 1 | Tool-Registry + `apply_sharepic_ops` + `read_sharepic_state`; `agenticResponseService` mit stopWhen, SSE-Events; Router-Branch hinter `CHAT_TOOL_LOOP`-Flag (nur Sharepic-Modus) | ~800–1000 LOC | 1 |
| 2 | Persistenz Multi-Tool-Calls + Frontend-Steps (parseSSEStream, ToolCallUI) | ~400–600 LOC | 2 |
| 3 | Restliche Tools (`search/generate_background_image`, `restore_version`, `create_variant`) + Budget-/Fehler-Härtung | ~300–400 LOC | 3 |
| 4 | Tests: Registry-Unit-Tests, Loop-Integration mit Mock-Model (AI SDK `MockLanguageModel`), SSE-Contract | ~500–800 LOC | 3–4 |

**Gesamt MVP: ~1.800–2.500 LOC hinter Flag, 3–4 gestackte PRs.** Erst nach
Bake-Zeit im Sharepic-Modus entscheiden, ob weitere Intents (Boards, Docs)
auf Tools umziehen — der chat-weite Vollausbau (~2–3k LOC Refactor des
806-LOC-Routers) ist ein separater Beschluss und derzeit NICHT empfohlen:
die 4-Tier-Classifier-Heuristiken beantworten häufige Fälle ohne LLM-Call,
ein Loop kostet pro Schritt einen vollen Modell-Roundtrip.

## Risiken

| Risiko | Gegenmaßnahme |
| --- | --- |
| Latenz: jeder Tool-Step = voller Roundtrip mit wachsendem Kontext | Step-Cap 4; Modus-Scope klein halten; `tool_step_*`-Events zeigen Fortschritt sofort |
| Token-Kosten 2–4× pro agentischem Turn | Flag + nur Sharepic-Modus; kompakte Tool-Results; Snapshot statt History |
| Provider-Kompatibilität (Mistral primär — Tool-Calling-Qualität schwankt) | v1 auf das Modell pinnen, das `canvas_ai_suggest` heute nutzt (tool-forced bewährt); Fallback: ein Step = bisheriger structured call |
| Doppel-Pfad-Drift (Loop vs. `sharepicEditService`) | Kern (Ops→Patch→Version→SSE) in gemeinsame Funktion extrahieren; `sharepicEditService` wird dünner Aufrufer |
| Endlos-/Pendel-Loops (Modell ruft wiederholt dasselbe Tool) | stopWhen + Dedup identischer aufeinanderfolgender Tool-Calls (Args-Hash) |

## Bewusst NICHT Ziel von v1

- Kein chat-weiter Ersatz der Intent-Pipeline (eigener Beschluss nach Bake-Zeit).
- Keine neuen Fähigkeiten, die es als Service nicht gibt (z. B. Formatwechsel —
  siehe `sharepic-chat-editing.md`, „Bewusst aufgeschoben").
- Kein paralleler Tool-Aufruf (AI SDK kann es; v1 sequenziell, einfacher zu
  debuggen und SSE-seitig darzustellen).
