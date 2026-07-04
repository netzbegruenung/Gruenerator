# Sheets — AI Assistant Testing Guide

A runbook for an AI assistant (using **Chrome DevTools MCP**, or Playwright) to verify the Univer **Sheets** feature end-to-end. Sheets are Univer spreadsheets stored as `collaborative_documents` (subtype `sheets`), edited live over Yjs/Hocuspocus, with an AI sidebar that plans operations applied through the Univer Facade API.

**How to use this guide:** work top-to-bottom. Each test has **Steps**, an **Expected** result, and **Capture** (what evidence to record). Stop and report at the first hard failure in section A (nothing else works if the editor doesn't render). For every test, also check the browser console (`list_console_messages`) for errors and the backend log for the tagged lines noted below.

---

## 0. Environment setup

You need the web frontend, the API backend, and the Hocuspocus collab server running, plus a way to authenticate.

### Option A — local dev (preferred for pre-merge branches)

```bash
pnpm dev:backend      # API (needs Postgres, Redis, Keycloak) + Hocuspocus
pnpm dev:web          # Vite on http://localhost:3000
```

Auth: set `VITE_E2E_AUTH_BYPASS=true` + `VITE_DEV_AUTH_BYPASS_TOKEN` in `apps/web/.env`, and `ALLOW_DEV_AUTH_BYPASS=true` + the same token in the root `.env`. **Never** set `ALLOW_DEV_AUTH_BYPASS=true` against prod (it fail-fasts to HTTP 500).

> ⚠️ Collab caveat seen before: with a multi-checkout dev setup, the WebSocket can point at the wrong port and CORS can reject `:3200`-style origins (`Not allowed by CORS`). If collab auth fails (`[Collab] Auth FAILED: permission-denied`), you're almost certainly hitting an env/port issue, **not** a feature bug — note it and continue with non-collab tests.

### Option B — deployed test environment

Use the deployed URL with a real login. This is the most faithful (real backend, real collab), but you can't inspect backend logs as easily.

### Reaching a sheet

Sheets live under `/docs`. Create one from the Documents page (**"Neue Tabelle"** tile in the TemplateCarousel) — this calls `POST /api/docs` with `document_subtype: 'sheets'` and navigates to `/docs/:id`, where the `CollabDocRoute` dispatcher mounts the Univer editor.

---

## A. Editor loads and renders ← **the smoke test; do this first**

This is the historically broken path (a blank workbook with zero worksheets rendered nothing). If this fails, nothing downstream matters.

### A1. New sheet renders an editable grid

- **Steps:** From `/docs`, click **"Neue Tabelle"**. Wait for navigation to `/docs/<uuid>`.
- **Expected:** A **spreadsheet grid** appears (cell rows/columns), with a **sheet tab** ("Tabelle1") at the bottom and a formula bar at the top. It is NOT stuck on the "Tabelle wird geladen…" skeleton, and NOT a blank white area.
- **Capture:** `take_screenshot`. Run `evaluate_script` to confirm the Univer canvas mounted:
  ```js
  () => ({
    hasEditor: !!document.querySelector('.gruenerator-sheets-editor'),
    hasCanvas: !!document.querySelector('.gruenerator-sheets-editor canvas'),
    sheetTabText: document
      .querySelector('.gruenerator-sheets-editor footer')
      ?.innerText?.slice(0, 60),
  });
  ```
  `hasCanvas` must be `true`.
- **Console:** no `[sheets-bridge]` errors, no React error boundary, no "Cannot read properties of null (getActiveSheet)".

### A2. Manual cell editing

- **Steps:** Double-click cell A1, type `Test`, press Enter. Type a number in B1.
- **Expected:** Values appear and persist in the cells; the formula bar shows the active cell's content.
- **Capture:** screenshot after entering a few cells.

### A3. Formula evaluation

- **Steps:** In cells A1:A3 enter `10`, `20`, `30`. In A4 enter `=SUM(A1:A3)`.
- **Expected:** A4 shows `60`. Editing A1 to `100` updates A4 to `150`.

---

## B. AI sidebar — value & formula edits

Open the chat sidebar (chat/message icon in the top bar). Ensure **AI-Bearbeitung** is enabled (toggle in the composer). The sidebar agent is `gruenerator-sheets-editor`; edits go `chat → trigger_doc_edit → POST /api/sheets/:id/ai → applySheetOperations`.

For each prompt: type it in the sidebar, send, wait for the assistant to finish, and observe the grid + the toast.

| #   | Prompt (German)                                             | Expected in grid                 | Toast                             |
| --- | ----------------------------------------------------------- | -------------------------------- | --------------------------------- |
| B1  | „Trage in A1 'Umsatz' und in B1 1000 ein"                   | A1=Umsatz, B1=1000               | „1 Änderung übernommen" (or n)    |
| B2  | „Ändere den Umsatz auf 2500"                                | B1 becomes 2500                  | success                           |
| B3  | „Summiere Spalte B in B10"                                  | B10 = `=SUM(...)`, shows the sum | success                           |
| B4  | (empty sheet) „mach die Überschriften fett" with no headers | nothing changes                  | „keine Tabellen-Änderung erkannt" |

- **Capture:** screenshot after B2 and B3.
- **Backend log to check:** `[SheetAI] Using Mistral Medium 3.5 (mistral-medium-2604)` and `[SheetAI] Planned N operation(s)`. If a prompt yields **0 operations unexpectedly**, grab the `[SheetAI] 0 operations …` diagnostic line — it reports `finishReason`, tool-call presence, dropped-op count, and context size, which pinpoints the cause.
- **Regression watch (the "keine Änderung" bug):** a clear change request on a sheet **with content** must produce operations, not the "keine Tabellen-Änderung erkannt" toast. If it wrongly says no-change, that's a regression — capture the backend `[SheetAI]` lines.

---

## C. Typed values & number formats (Phase 0 correctness)

The AI must treat currency/percent/dates as **number + format**, and IDs as text — not as display strings.

| #   | Prompt                                                         | Expected                                                                                                   |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| C1  | „Formatiere Spalte B als Euro"                                 | B cells display like `1.000,00 €` but the **stored value stays numeric** (a later `=SUM(B:B)` still works) |
| C2  | „Formatiere Spalte C als Prozent"                              | values show `25 %` etc.; underlying value is the fraction                                                  |
| C3  | „Trage die Kundennummer 00123 in A2 ein"                       | A2 shows `00123` (leading zero kept), left-aligned as text — NOT `123`                                     |
| C4  | „Schreibe das Datum 2026-03-15 in D2 und formatiere als Datum" | D2 renders a date; a `=D2+1` in D3 yields the next day (proves it's a date serial, not text)               |

- **How to verify "stored value is numeric, not a string":** after C1, ask the AI „summiere Spalte B in B20" — if the sum is correct, the values are numeric. A wrong/zero sum means they were written as formatted strings (correctness regression).
- **Capture:** screenshot of the formatted columns; note the C4 date-math result.

---

## D. Structural ops (Phase 1a)

| #   | Prompt                               | Expected                                                |
| --- | ------------------------------------ | ------------------------------------------------------- |
| D1  | „Füge 2 Zeilen über Zeile 5 ein"     | 2 empty rows inserted; old row 5 content moves to row 7 |
| D2  | „Lösche Spalte C"                    | column C removed; D shifts left into C                  |
| D3  | „Verbinde A1:C1 zu einer Titelzeile" | A1:C1 becomes one merged cell keeping A1's value        |
| D4  | „Hebe die Verbindung von A1:C1 auf"  | the merge is split back into individual cells           |

- **Capture:** screenshot after D1 and D3.
- **Undo check:** press **Cmd/Ctrl+Z** after D2 — the deleted column should come back (AI edits share the native undo stack).

---

## E. Charts (Phase 2 — Recharts via Float DOM) ← **needs a data range first**

Seed data before charting. Fastest: prompt „Erstelle eine Tabelle mit Quartal (Q1–Q4) in Spalte A und Umsatz und Kosten als Spalten B und C mit Beispielzahlen" (or type it manually).

| #   | Prompt                                  | Expected                                                                                                      |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| E1  | „Erstelle ein Balkendiagramm aus A1:C5" | A **bar chart** appears as a floating box over/near the range, with a legend (Umsatz, Kosten) and axis labels |
| E2  | „Erstelle ein Kreisdiagramm aus A1:B5"  | a **pie chart** of the first series appears                                                                   |
| E3  | „Erstelle ein Liniendiagramm aus A1:C5" | a **line chart**                                                                                              |

- **Capture:** screenshot showing the rendered chart. Confirm it's an actual SVG chart (Recharts), not an empty box or "Keine Diagrammdaten".
  ```js
  () => document.querySelectorAll('.gruenerator-sheets-editor svg.recharts-surface').length;
  ```
  Should be ≥ 1 after E1.
- **Interaction:** drag the chart box — it should move (it's `allowTransform: true`). Hover a bar/slice — a Recharts tooltip appears.
- **Known MVP limit:** the chart snapshots the data at creation time; editing the source cells afterwards does **not** live-update the chart yet. Not a bug — note it if asked.
- **Backend log:** `[SheetAI] Planned 1 operation(s)` with an `add_chart` op. Console: no errors from `recharts` or `SHEET_DRAWING_PLUGIN`.

---

## F. Collaboration (two clients)

Open the **same** `/docs/:id` URL in a second tab (or a second browser profile / guest window).

| #   | Action in Tab 1             | Expected in Tab 2 (live, no reload)              |
| --- | --------------------------- | ------------------------------------------------ |
| F1  | Type a value in A1          | A1 updates within ~1s                            |
| F2  | AI edit „ändere B1 auf 999" | B1 updates to 999                                |
| F3  | Insert a row (D1 above)     | the row appears                                  |
| F4  | Add a chart (E1)            | the chart appears                                |
| F5  | Presence                    | each tab shows the other's avatar in the top bar |

- **Capture:** side-by-side screenshots after F2 and F4.
- If nothing syncs, check console for `[Collab] Auth FAILED` (env issue, see §0) vs. a genuine bridge error `[sheets-bridge] remote apply failed`.

---

## G. Persistence (reload / late join)

| #   | Steps                                                                             | Expected                                                            |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| G1  | Make several edits (values, a merge, a chart), wait ~5s, then **reload** the page | all edits, the merge, and the chart are still there                 |
| G2  | Open the same URL in a **fresh** browser profile (late joiner)                    | the full current state loads from the snapshot, including the chart |

- The snapshot is written by compaction/autosnapshot; charts persist via `resources.SHEET_DRAWING_PLUGIN` in `workbook.save()`. A missing chart after reload = persistence regression.

---

## H. Chat integration (main chat, not the sidebar)

From the main app chat (`/chat`), not the sheet's sidebar:

| #   | Prompt                                                      | Expected                                                                                            |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| H1  | „Erstelle eine Budget-Tabelle mit Formeln"                  | classifier routes to `create_sheet`; a **sheet card** appears; opening it shows seeded data         |
| H2  | „@" then pick a sheet, ask „Was ist die Summe der Umsätze?" | the sheet's content is injected as context; the answer reflects the cell values                     |
| H3  | „Füge eine Tabelle ins Textdokument ein"                    | must **NOT** trigger `create_sheet` (this is a doc table) — verify it does not create a spreadsheet |

- **Backend log:** `[ChatGraph:Classifier]` shows the chosen intent; confirm `create_sheet` for H1 and a doc/table intent (not `create_sheet`) for H3.

---

## I. Sharing, guests, read-only

| #   | Steps                                                                | Expected                                                                               |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| I1  | Open the Share modal (top bar), share the sheet with a group         | group members can open it                                                              |
| I2  | Set link sharing to "viewer", open the public link in a guest window | the sheet is **read-only**: cells can't be edited, AI-edit toggle is unavailable/no-op |
| I3  | As a read-only guest, confirm the grid still renders and scrolls     | view works; writes are blocked server-side (Hocuspocus)                                |

---

## Dark mode

Toggle the app to dark mode with a sheet open. The grid, formula bar, and **footer bar** (sheet tabs + zoom) must all be dark — no cream/white footer strip. (`[data-theme='dark'] .gruenerator-sheets-editor footer` handles the footer specifically.)

---

## What to collect in the report

For each failed test:

1. The test id (e.g. **E1**) and the exact prompt/action.
2. A screenshot of the wrong result.
3. Relevant **console errors** (`list_console_messages`, filter to errors/warnings).
4. Relevant **backend log lines** — especially `[SheetAI] …`, `[sheets-bridge] …`, `[ChatGraph:Classifier] …`.
5. Whether it's reproducible or intermittent.

Prioritize: **A (render) > B/C (edits correct) > F/G (collab+persist) > E (charts) > H/I (integration/sharing)**. A failure in A blocks everything; report it immediately.

## Quick reference — where each behavior lives (for triage)

- Editor mount / blank-workbook seed → `packages/sheets/src/lib/blankWorkbook.ts`, `collab/bridge.ts`
- AI op planning + model + prompt → `apps/api/routes/sheets/sheetAiService.ts`
- AI op application (Facade calls) → `packages/sheets/src/ai/applySheetOperations.ts`
- Sheet context sent to the model → `packages/sheets/src/ai/serializeSheetContext.ts`
- Chart rendering → `packages/sheets/src/components/SheetChartFloat.tsx`, `ai/buildChartData.ts`
- Collab bridge (sync + undo + snapshot) → `packages/sheets/src/collab/bridge.ts`
- Route dispatch (docs vs sheets) → `apps/web/src/features/docs/CollabDocRoute.tsx`
