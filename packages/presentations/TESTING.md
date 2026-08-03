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

PPTX export (scenario 9) needs no extra tooling — it is built in-process with
pptxgenjs. (It used to shell out to `pandoc`; that has not been true since
`57150c53c`.)

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

## 2b. Tables and images

1. On a `content` slide, click into the body, then **Tabelle** in the toolbar
   above the slide.
2. **Expected**: a 3×2 table with a header row appears on the slide, styled in
   the deck theme (accent header, zebra body rows). The toolbar grows a second
   group: row/column insert + delete, header toggle, delete table.
3. Type into cells; add a row and a column; drag across two cells.
   **Expected**: the selection is tinted with the deck accent (`.selectedCell`),
   and the slide auto-fit shrinks the text once the table outgrows the surface —
   sideways as well as downwards.
4. Click **Bild**. Pick a library image, or upload one.
   **Expected**: the URL field fills in; the alt field prefills from the library
   entry when it has one. **Einfügen** stays disabled until an alt text exists.
5. Insert it. **Expected**: the image renders on the slide, capped in height.
6. Reload. **Expected**: table and image are still there (they went through the
   Y.Doc, not just the DOM).
7. Repeat 1 and 4 on a phone (or with a coarse pointer emulated): the same two
   buttons sit under the textarea in the edit sheet and write markdown.
8. Export to PPTX (scenario 9) and to PDF (scenario 8) and check both survive.

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

Prepare the deck first: ≥4 slides, one of them with deliberately overflowing body
text (paste ~15 long bullets — the editor canvas must visibly shrink it), one with
a dark background, and leave at least one slide's Schriftgröße on "Auto".

1. **Download → Als PDF** → a new tab opens at `/office/<id>?present=1&print-pdf`
   showing a white page with a vertical stack of slides — no sidebar, no top bar,
   no thumbnail rail, no cookie banner — then the print dialog.
2. **Expected** (Chrome/Chromium): choosing "Als PDF speichern" produces **one page
   per slide**. Page through the whole preview, not just the first page.
3. **The overflowing slide must be shrunk and complete, not clipped.** Compare
   against the editor canvas. This is invisible on page 1 — page 1 was always the
   "current" slide and always fitted.
4. Repeat in **dark mode**: the page background must stay white; only the
   dark-background slide is dark.
5. Repeat once in **Firefox**: slide backgrounds, accent panels and the title bar
   must still be there (that is the unprefixed `print-color-adjust`).
6. Open the print URL directly in a fresh tab on a throttled connection
   (DevTools "Slow 3G"): must produce the full deck, never a blank sheet.
7. Non-regressions: Ctrl+P on the plain editor still prints the editor; live
   present mode (toolbar, Esc, F/O/S, fullscreen) is unchanged; Lesemodus still
   fits every slide's text and still exits on Esc.

## 9. PowerPoint (PPTX) export

1. **Download → Als PowerPoint.**
2. **Expected**: a `<title>.pptx` downloads; opening it in LibreOffice Impress /
   PowerPoint shows one slide per deck slide with titles, bullets, code blocks and
   speaker notes. Backend logs under `[PresentationExport]`.
3. Check against the screen: a two-column (`split`) slide must not break a bullet
   across columns; an image must keep its aspect ratio; an AT deck's quote must be
   set in Vollkorn.
4. **Content-Varianten**: a "Karten" slide must show a two-column grid of rounded
   tinted cards (not a single column of bullets); a "Nummeriert" slide must show
   round accent pills carrying the index in the heading font (not PowerPoint's own
   `1.` numbering).
5. **Title spacing**: a slide _without_ a title must start its body at the top
   padding edge, not a third of the way down. A slide with a two-line title must
   push its body further down than a one-line one. Compare side by side with the
   editor canvas.
6. **Auto-Fit**: the deliberately overflowing "Auto" slide from scenario 8 must
   already be shrunk **on open**, in LibreOffice Impress and in Keynote — not only
   after clicking into the text box in PowerPoint. That is the whole point of
   measuring server-side; `<a:normAutofit/>` alone never fired in those viewers.
7. **As a share-link guest** (private window): the PowerPoint entry must not be
   offered at all — the endpoint is behind `requireAuth`. "Als PDF" must work.

## 10. Recent activity

1. Return to `/docs` or the workplace start page.
2. **Expected**: the new deck appears in "Zuletzt erstellt" with the 🎬 emoji,
   opening `/docs/<id>`; delete works via the standard docs delete.

---

## Automated checks

```bash
pnpm --filter @gruenerator/presentations test   # useSlides ops + apply ops
pnpm --filter @gruenerator/api exec vitest run routes/presentations/
pnpm typecheck                                    # whole monorepo
```
