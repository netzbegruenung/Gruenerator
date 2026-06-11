# Sharepic-Editing im Chat — Architektur & bewusst Aufgeschobenes

Eingeführt mit PR #1215 (`sharepic_edit`-Intent) und dem Follow-up-PR
`fix/canvas-template-text-collab-sync`. Diese Datei hält fest, wo die Teile
liegen und was BEWUSST nicht umgesetzt wurde — damit spätere Arbeit nicht
versehentlich „fehlende Features" als Bugs behandelt oder Scope-Entscheidungen
neu erfindet.

## Architektur-Pointer

- **Intent-Branch:** `apps/api/routes/chat/chatGraphContractRouter.ts` →
  `handleSharepicEdit` in `routes/chat/services/sharepicEditService.ts`
  (Ziel-Auflösung, Lazy-Mint, LLM-Call, Patch, Version, SSE). Legacy-Refinement
  (Text-Regeneration) bleibt als Fallback dahinter.
- **Ein strukturierter LLM-Call, kein Tool-Loop** (`sharepicEditLlm.ts`,
  Muster aus `runCanvasSuggest`). Bewusste Entscheidung: der Chat bleibt
  intent-basiert; ein agentischer Tool-Loop wäre ein eigenes
  Architektur-Projekt für den gesamten Chat.
- **Editierbare Oberfläche pro Template:**
  `packages/contracts/src/schemas/canvasTemplateDescriptors.ts` (server-sicher,
  pure data; Parity-Vitest in
  `packages/canvas-editor/src/ai/sharepicDescriptorParity.vitest.ts`).
- **Yjs-Autorität:** Hocuspocus-interner Endpoint
  `GET/POST /internal/canvas/:id/state` (`services/hocuspocus/src/internalApi.ts`,
  `openDirectConnection`). API-Fassade: `apps/api/services/canvas/canvasStateService.ts`
  (`initial_state` ist nur Lese-Mirror/Fallback). Envs:
  `HOCUSPOCUS_INTERNAL_TOKEN` (Feature aus, wenn unset), `HOCUSPOCUS_INTERNAL_URL`.
- **Y-Topologie-Gotcha:** Template-Felder leben doppelt — root `formState`
  (Schreibziel der Host-Callbacks) und `pages[i].state` (Mount-Quelle der
  GenericCanvas-Seiten). Seit dem Follow-up-PR dual-writen Studio-Callbacks
  in beide (`wrapCallbacksWithPageSync`), gemountete Seiten übernehmen externe
  Änderungen via `useYjsPageStateSync`, und ein One-Shot-Heal in
  `CanvasEditorRouter` kopiert bei Single-Page-Altdokumenten formState →
  `pages[0].state`. Chat-Patches schreiben serverseitig ebenfalls in beide.
- **Versionen:** `canvas_state_versions` (volle flache States, max. 20,
  Origins `mint`/`chat-edit`/`restore`); Restore = Vorwärts-Patch, nie
  Yjs-Rewind. Varianten-Mapping: `chat_thread_canvases`.
- **Kontext-Disziplin:** pro Edit landen nur `{ canvasId, variantId, version,
  summary }` in `tool_results`; voller State reist ausschließlich über SSE
  (`sharepic_minted` / `sharepic_updated` / `sharepic_edit_error`).
- **Thumbnails:** nach jedem echten Edit (SSE-Update/Restore, NICHT
  Mount-Rehydration) markiert der Client den Eintrag `thumbnailDirty`;
  `SharepicVariantCard` lädt den nächsten erfolgreichen Head-Render als
  Thumbnail hoch (`updateSharepicThumbnail`-Callback in
  `GlobalChatProvider`: Media-Library-Upload + `PATCH /api/canvas/:id`).
  Best-effort — Fehler erscheinen nie in der Chat-UI.

## Bewusst aufgeschoben (kein Bug — Scope-Entscheidung)

| Thema | Warum aufgeschoben | Wenn doch gebraucht |
| --- | --- | --- |
| **Agentischer Tool-Loop im Chat** | User-Entscheidung „structured call now, loop later"; Loop wäre Chat-weiter Umbau (Latenz, Kosten, Kontext-Wachstum) | `sharepicEditService` ist als Tool-Executor wiederverwendbar gebaut |
| **Formatwechsel per Chat** (Portrait → Story …) | `canvas.resize` klont ein NEUES Dokument → bricht Karten-Identität (canvasId in Thread & Versionen) | Konzept nötig: Karte auf neues Doc umhängen oder Resize-in-place |
| **Multi-Page-Sharepics** (Slider, Präsentationen) | Patches gehen nur auf Seite 0; `formState` kann Edits nicht seitenweise attribuieren | Ops um `pageId` erweitern; Deskriptoren für Slider/Pres-Templates |
| **KI-generierte / hochgeladene Hintergründe** | v1 nur Stock-Suche (`set-background-image` → ImageSelectionService) | Flux-Pfad existiert im image-Intent; Upload bräuchte Attachment-Routing in den Edit-Branch |
| **Chat-Edits auf fremden / nicht im Chat geminteten Canvases** | Berechtigungs- und UX-Fragen ungelöst (wessen Karte? welcher Thread?) | `chat_thread_canvases` um externe Docs erweitern + ACL-Prüfung |
| **Studio-Edits in der Versions-Historie** | Yjs-Snapshots decken Studio-Historie ab; Karten-Stepper zeigt nur Chat-Edits | Hook in `onStoreDocument` oder Hocuspocus-Change-Hook |
| **`@sharepic` in Produktion** | Mentionable ist dev-only geflaggt (`packages/chat/src/lib/mentionables.ts`), bis die manuelle E2E-Matrix aus PR #1215 gelaufen ist | Flag entfernen + Envs in prod setzen |
| **Heal für Multi-Page-Altdokumente** | `formState` mischt die letzten Edits ALLER Seiten — nicht attribuierbar; Heal läuft nur bei `pages.length === 1` | Nur mit per-Page-Schreibhistorie möglich; ab Dual-Write entsteht das Problem nicht mehr neu |

## Bekannte pre-existing Failures (nicht aus diesen PRs)

- `services/hocuspocus/src/persistence.vitest.ts`: 1 Test rot
  („snapshot-v2" statt „live-state").
- `packages/chat`: Console-Runner-Testdateien (`adapterUtils.test.ts`,
  `mentionParser.test.ts`) loggen intern „passed", schlagen unter vitest aber
  mit „No test suite found" fehl.
