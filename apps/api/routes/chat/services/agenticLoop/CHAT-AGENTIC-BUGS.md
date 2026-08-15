# Behobene Fehler: Chat-Artefakt-Erstellung (Board/Doc/PDF)

Gefunden beim Auswerten von Backend-Logs eines Multi-Artefakt-Chat-Tests am 2026-08-06
(Grundlage: `af51bb9b5`, aktueller master). Alle 4 sind in dieser PR behoben — Diagnose
und Root Cause bleiben hier als Referenz stehen. Strukturierte Version:
[`knownBugs.ts`](./knownBugs.ts).

## 1. Dedup-Guard blockiert `create_board`/`boards_tasks` fälschlich als Duplikat — BEHOBEN

**Datei:** [`wrapTools.ts:198, 215-218`](./wrapTools.ts)
**Root Cause:** `skipNearDuplicate` wird als `!!server` berechnet (`server =
ctx.serverNameFor?.(toolName)`). `server` kommt nur für MCP-Connector-Tools aus
`toolLabels` (siehe `agenticRespondService.ts`, dort aus `mcpCatalog`/`systemCatalog`
gefüllt). `create_board` und `boards_tasks` sind interne `personalDataTools`
(`apps/api/routes/chat/agents/personalDataTools.ts`) ohne `serverName`-Eintrag —
`server` ist für sie immer `undefined`, also `skipNearDuplicate: false`, obwohl der
Kommentar direkt darüber (Zeile 215-217) genau diesen Fall — strukturierte Args, die
legitim viele Tokens teilen — als Grund für den Skip nennt.

**Symptom im Log:** Board-Operationen im selben Turn (weitere Karten, Board
modifizieren) werden als `blockiert (near_duplicate)` abgelehnt mit "Wechsle das THEMA
oder antworte jetzt mit den vorhandenen Ergebnissen" — für legitime Folgeaufrufe.

**Fix:** `NEAR_DUPLICATE_EXEMPT_TOOLS` (`types.ts`) — `skipNearDuplicate` berücksichtigt
jetzt zusätzlich ein Tool-Set (`create_board`, `boards_tasks`, `documents`,
`read_artifact`, `notebooks`) statt ausschließlich `!!server`.

## 2. Board-Generierung trifft weiterhin die Modell-eigene Output-Grenze — BEHOBEN

**Datei:** [`apps/api/services/ai/config.ts:81-101`](../../../../services/ai/config.ts)
**Root Cause:** `board_generation` steht bewusst in `UNCAPPED_TYPES` (Kommentar dort,
Stand 03.08.2026): kein `max_tokens` wird gesendet, die App verlässt sich auf die
Modell-eigene Grenze — laut Kommentar "the only bound that is actually correct per
model". Für `doc_generation` gibt es dafür bereits eine Recovery ("recovered from
text" bei abgeschnittenem JSON). **Für `board_generation` fehlt diese Reaktion noch** —
ein 12-Karten-Board mit Prioritäten/Zuständigkeiten/Abhängigkeiten trifft
`mistral-medium-2604`s 16384-Token-Ceiling und bricht ohne Fallback ab.

**Symptom im Log:** `[mistralAdapter] Output token budget exhausted
(finish_reason=length) for type=board_generation ... outputTokens=16384`.

**Fix:** `generateStructured.ts` behandelt jetzt auch einen erzwungenen Tool-Call ohne
verwertbares Ergebnis bei `stop_reason='tool_use'` als Truncation (`noToolDespiteForced`)
— läuft in denselben Repair-dann-Torso-Pfad wie `stop_reason='length'`, statt in die
generische Fehlermeldung. `UNCAPPED_TYPES` bleibt unverändert (der Cliff-Kommentar
begründet das korrekt).

## 3. GreenPT/gemma4 Gateway-Timeout bei `doc_generation` — Denk-Modus ignoriert Abschaltung — GEMILDERT

**Datei:** [`apps/api/services/ai/greenptThinkingFetch.ts:31-34`](../../../../services/ai/greenptThinkingFetch.ts)
**Root Cause:** `greenptFetchWithThinkingDisabled` setzt `think: false` /
`enable_thinking: false`; der Code-Kommentar selbst dokumentiert "gemma4 ignores
reasoning controls entirely ... tracked as follow-up, not solved here" — gemma4 denkt
trotzdem weiter, bis das Gateway abbricht. Der fixe `maxRetries: 2`
(`apps/api/services/ai/execution/execute.ts`) wiederholt danach denselben zu langsamen
Request unverändert.

**Symptom im Log:** `[greenpt] Request failed after retries: Failed after 3 attempts.
Last error: AI_APICallError: Gateway Timeout` bei `doc_generation`.

**Fix:** `execute.ts` gibt greenpt nur noch 1 statt 2 Retries (`maxRetries: provider ===
'greenpt' ? 1 : 2`) — erreicht die bestehende Provider-Fallback-Kette schneller. Der im
Code selbst benannte Follow-up (Output-Budget-Floor für die `think`-Lane von gemma4)
bleibt offen — das ist eine Latenz-Milderung, keine Wurzelursachen-Behebung.

## 4. Fertiger Agentic-Turn verschwindet ohne User-sichtbares Signal — BEHOBEN

**Datei:** [`postResponseService.ts:477-491`](./../postResponseService.ts) (+ Resume-Pfad ~Zeile 780)
**Root Cause:** Das Verwerfen selbst ist **by design** (Kommentar Zeile 478-481: ein
Regenerate/Edit auf einer anderen Kachel darf die alte Platzhalter-Zeile löschen, ein
Re-Insert würde einen vom Nutzer verworfenen Turn "wiederbeleben"). Der Lücke liegt
tiefer: Wenn `finalizeAssistantMessage` (UPDATE-per-ID) 0 Zeilen trifft, weil
`discardPendingAssistantIfEmpty` oder `deleteMessagesFrom` die Zeile in der
Zwischenzeit gelöscht hat, gibt es **kein User-sichtbares Signal** — nur eine
Warn-Zeile im Server-Log. Bei den beobachteten Fällen lief die Generierung 27–247
Sekunden und lieferte 102–463 Zeichen fertigen Text, bevor sie verworfen wurde.

**Symptom im Log:** `[PostResponse] Pending assistant row ... vanished before finalize
— response discarded` — zweimal im selben Test-Chat, jeweils nach vollständiger
Antwort.

**Fix:** `PersistOutcome.discarded` + neuer `turn_discarded`-Warning-Code
(`chatStreamEvents.ts`, `sseHelpers.ts`), gesetzt an beiden vanished-row-Stellen in
`postResponseService.ts` und verdrahtet an allen 3 Persist-Aufrufstellen
(`chatGraphContractRouter.ts`, `resumePipeline.ts` ×2). Kein Re-Insert — das
Design-Argument dagegen bleibt korrekt.
