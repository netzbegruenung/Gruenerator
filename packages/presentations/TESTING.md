# Presentations — AI test runbook

A step-by-step manual test guide written **for an AI agent** (e.g. Chrome
DevTools MCP) to drive the local dev stack and verify the reveal.js presentations
feature end to end. Each scenario lists the action, the expected result, and the
backend log marker to confirm.

## 0. Prerequisites

Run from the repo root (this worktree):

```bash
pnpm install                 # once
pnpm --filter @gruenerator/shared build:agents   # regenerate the agent index
pnpm dev:backend             # API on :3001 (needs Postgres, Redis, Keycloak)
pnpm dev:web                 # web on :3000
# hocuspocus collab server (separate process)
pnpm --filter @gruenerator/hocuspocus dev
```

Auth: use the dev bypass so the agent is logged in without Keycloak.

- `apps/web/.env`: `VITE_E2E_AUTH_BYPASS=true` + `VITE_DEV_AUTH_BYPASS_TOKEN=<token>`
- root `.env`: `ALLOW_DEV_AUTH_BYPASS=true` + the same token
- (In a fresh worktree the `.env` files are untracked — copy them from the main
  checkout first.)

PPTX export (scenario 9) needs `pandoc` on the API host: `brew install pandoc`
(macOS) or `apt-get install pandoc` (Linux). Without it the endpoint returns
HTTP 501 and the UI shows a clear German error — that is also a valid pass.

Backend log prefixes to watch: `[ChatGraph:Classifier]`, `[PresentationAI]`,
`[PresentationGeneration]`, `[PresentationExport]`.

---

## 1. Create a deck from the UI

1. Navigate to `http://localhost:3000/docs`.
2. In the template carousel, click the **Präsentation** tile ("Foliensatz mit KI").
3. **Expected**: navigates to `/docs/<uuid>`; the deck editor opens with a
   thumbnail rail on the left showing **2 seeded slides** ("Neue Präsentation"
   title slide + "Folie 2"), the active slide rendered in the Grüne theme
   (Tanne-green title slide), and a top bar with undo/redo, present, Lesemodus,
   PDF, PowerPoint, share, and chat buttons.
4. Screenshot the editor.

## 2. Edit slides

1. Click the active slide title, change it; edit the body textarea (markdown,
   e.g. `- Punkt A\n- Punkt B`). Change **Layout** to "Zitat" and back.
2. Add a slide with the **+ Folie** button; delete a slide; reorder with the
   up/down arrows on a thumbnail (hover to reveal them).
3. Change **Übergang**, toggle **Schrittweise** / **Auto-Animate** / **Ausblenden**,
   set a **Hintergrund** (e.g. `#316049`).
4. Reload the page.
5. **Expected**: all edits persist (Hocuspocus stored the Y.Doc). Slide count and
   content match what you left.

## 3. Two-tab collaboration

1. Open the same `/docs/<id>` in a second tab (or an incognito window via the
   share link from scenario 7 as a guest).
2. Edit a slide title in tab A.
3. **Expected**: the change appears in tab B within ~1s; presence avatars show
   the other participant. Creating the deck simultaneously in two tabs must not
   double-seed (exactly the seeded slides, no duplicates).

## 4. Create a deck from chat

1. Go to `/chat`. Send: **"Erstelle eine Präsentation über kommunale
   Wärmeplanung"**.
2. **Expected**: backend logs `[ChatGraph:Classifier]` with intent
   `create_presentation`; an artifact card appears in the chat; clicking it opens
   `/docs/<id>` with a full 5–12 slide deck (first slide layout "title").
3. Confirm a `collaborative_documents_init` row exists for that id (seeded Y.Doc).
4. Alternative: type `@` in the composer and pick **Präsentation erstellen**
   (forced tool `praesentation-erstellen`) — same result.

## 5. AI edit from the editor chat panel

1. In the deck editor, open the chat panel (message icon in the top bar). The
   agent is **Präsentations-Assistent**.
2. Ensure the AI-edit toggle (in the composer send adornment) is ON.
3. Send: **"Füge am Ende eine Folie mit den drei wichtigsten Argumenten hinzu"**.
4. **Expected**: a new slide is appended; a toast shows "1 Änderung übernommen.";
   backend logs `[PresentationAI] Planned N operation(s)`. Undo (top bar) reverts
   the AI edit.
5. Try **"Mach aus Folie 3 eine Code-Folie mit einem TypeScript-Beispiel"** and
   **"Gib der Titelfolie einen grünen Hintergrund"** — verify the code layout and
   background apply.

## 6. Present mode + reveal features

1. Click **Präsentieren**. A fullscreen reveal.js deck opens with the Grüne theme.
2. Verify: arrow-key / space navigation, the auto-hiding toolbar (overview,
   fullscreen, speaker view, close), **O**/**Esc** for overview, **F** for
   fullscreen, fragments stepping (if enabled), per-slide transitions.
3. Press **S** (or the speaker-view button) → a speaker window opens with notes +
   next slide.
4. If a slide has code, confirm syntax highlighting; if a body has `$…$` LaTeX,
   confirm KaTeX rendering.
5. Close and click **Lesemodus** → the deck renders as one scrollable page
   (reveal scroll view).

## 7. Sharing

1. Click **Teilen**; set a share mode + copy the link.
2. Open the link in an incognito window (guest).
3. **Expected**: a viewer sees the deck read-only; "Präsentieren" still works;
   an editor-permission share can edit and syncs live (scenario 3).

## 8. PDF export

1. Click the **PDF** (download) button → a new tab opens at
   `/docs/<id>?present=1&print-pdf`, auto-enters present mode in reveal's print
   layout, and triggers the browser print dialog.
2. **Expected** (Chrome/Chromium): choosing "Save as PDF", Landscape, no margins,
   background graphics ON produces one page per slide.

## 9. PowerPoint (PPTX) export

1. Click the **PowerPoint** (file-text) button.
2. **Expected (pandoc installed)**: a `<title>.pptx` downloads; opening it in
   LibreOffice Impress / PowerPoint shows one slide per deck slide with titles,
   bullets, code blocks and speaker notes. Backend logs under
   `[PresentationExport]`.
3. **Expected (pandoc missing)**: a toast "PowerPoint-Export ist auf diesem
   Server nicht verfügbar (pandoc fehlt)." and HTTP 501 — also a pass.

## 10. Recent activity

1. Return to `/docs` or the workplace start page.
2. **Expected**: the new deck appears in "Zuletzt erstellt" with the 🎬 emoji,
   opening `/docs/<id>`; delete works via the standard docs delete.

---

## Automated checks

```bash
pnpm --filter @gruenerator/presentations test   # useSlides ops + apply ops
pnpm --filter @gruenerator/api exec vitest run routes/presentations/presentationPptxExport.vitest.ts
pnpm typecheck                                    # whole monorepo
```
