# Agent-Skills & versionsgenaue Doku

**Die Regel:** Bei Änderungen an einer der unten gelisteten Libraries **erst die Quelle lesen, dann schreiben** — nicht aus dem Gedächtnis. Das Modell-Training ist älter als unsere `package.json`; APIs werden umbenannt und entfernt. Der Aufwand ist ein Tool-Call, der Fehler kostet einen Debug-Zyklus.

Reihenfolge: **mitgelieferte Doku im Paket** → **installierte Skill** → **`llms.txt`**. Je weiter links, je versionsgenauer.

## Wo Skills liegen

`.agents/skills/` (universal, für Codex/Copilot/Cursor mitbenutzt), `.claude/skills/` symlinkt darauf. Installation: `npx skills@latest add <repo> -y [--skill <name>]` — `-y` muss **vor** `--skill` stehen, sonst wird still nichts installiert. Ausnahme Expo: Claude-Code-Plugin (`claude plugin install expo@claude-plugins-official`), user scope, Auto-Update über den Marketplace.

Skills nutzen progressive disclosure: beim Start lädt nur Name + Beschreibung, der Body erst bei Bedarf. Deshalb kosten viele Skills wenig — im Gegensatz zu Prosa in CLAUDE.md.

## Mit Skill (bevorzugt)

| Library | Skills | Zusätzlich |
| --- | --- | --- |
| AI SDK | `ai-sdk`, `ai-elements`, `migrate-ai-sdk-v6-to-v7` | **`node_modules/ai/docs/` + `src/`** — versionsgenau, schlägt alles andere. Sonst `ai-sdk.dev/llms.txt` |
| Tailwind **v4** | `tailwind-4-docs` (Lombiq) | Tailwind hat **kein** `llms.txt` — die Skill ist die einzige maschinenlesbare Quelle. Plus `CLAUDE-styling.md` |
| LangChain / LangGraph | 21 Skills: `langgraph-*`, `langchain-*`, `deep-agents-*` | `docs.langchain.com/llms.txt` (100 kB). Vor Umbauten am Chat-Stack: `docs/chat-architecture-evaluation.md` |
| Qdrant | 10 Skills: `qdrant-search-quality`, `-multitenancy`, `-performance-optimization`, `-monitoring`, `-scaling`, … | `qdrant.tech/llms.txt` |
| Expo | Plugin `expo@claude-plugins-official` (22 Skills) | `docs.expo.dev/llms.txt`, `/llms-eas.txt`, `/llms-sdk.txt`; jede Doku-URL + `.md` = Markdown. **Wir sind auf SDK 57** — versionierte Bundles beachten |
| Better Auth | `better-auth-best-practices`, `create-auth-skill`, `organization-best-practices` | `better-auth.com/llms.txt`; Remote-MCP `https://mcp.better-auth.com/mcp` (nicht eingerichtet) |
| Sentry | Plugin `sentry@claude-plugins-official` (`sentry-instrument`, `sentry-debug-issue`, `sentry-feature-setup`, …) | Quell-Repo `getsentry/sentry-for-ai` ist **nicht** direkt installierbar; Skills auch per HTTP unter `skills.sentry.dev` |
| Langfuse | `langfuse` (offiziell: `langfuse/skills`) | Deckt CLI-Zugriff auf Traces/Prompts/Datasets **und** Doku-Lookup ab |
| mem0 | `mem0` (SDK, Default), `mem0-integrate` (offiziell: `mem0ai/mem0`) | `github.com/mem0ai/mem0/blob/main/docs/llms.txt`. Weitere Skills im Repo: `mem0-cli`, `mem0-vercel-ai-sdk`, `mem0-oss-to-platform` |
| Linkup | `linkup-search`, `-fetch`, `-research`, `-extract`, `-workflow` | `docs.linkup.so/llms.txt` |
| Turborepo | `turborepo` | `turborepo.com/llms.txt` |
| Tiptap | `tiptap` | `tiptap.dev/llms.txt` |
| Vitest | `vitest` | `vitest.dev/llms.txt`; unsere Konventionen in `apps/web/CLAUDE-testing.md` |
| assistant-ui | 13 Skills: `setup`, `runtime`, `streaming`, `primitives`, `tools`, `thread-list`, … | — |
| Univer | `univer-integrate`, `univer-plugin-dev`, `univer-node-backend`, `univer-pro-integrate` (offiziell: `dream-num/univer-sdk-skills`) | **Alle `@univerjs/*` und `@univerjs-pro/*` auf identischer Version halten** — Mischversionen sind laut Univer die häufigste Runtime-Fehlerquelle. `univer-integrate` ist lokal gepatcht: die Upstream-Frontmatter hat unquoted YAML (`Triggers: '…'`) und wird sonst vom Installer stillschweigend übersprungen — bei einem Update erneut quoten |
| shadcn | `shadcn`, `tool-ui` | MCP-Server in `.mcp.json` |

## Nur `llms.txt` (kein vertrauenswürdiges Skill-Pack)

Für diese gibt es auf skills.sh nur Packs von Einzelpersonen — nicht installiert, weil Skills mit vollen Agent-Rechten laufen. Stattdessen `llms.txt` per WebFetch:

| Library | URL | Größe |
| --- | --- | --- |
| Drizzle | `orm.drizzle.team/llms.txt` | 37 kB |
| Zod | `zod.dev/llms.txt` | 21 kB |
| TanStack Query | `tanstack.com/llms.txt` | 11 kB |
| Mistral (Primär-Provider) | `docs.mistral.ai/llms.txt` | 15 kB |
| Motion | `motion.dev/llms.txt` | 48 kB |
| Konva | `konvajs.org/llms.txt` | 4,8 kB |
| Yjs | `docs.yjs.dev/llms.txt` | 4,8 kB |
| Tauri 2 | `v2.tauri.app/llms.txt` | 2,8 kB (nur Index) |

Niedrige Priorität, weil stabil und gut im Training: `react.dev/llms.txt`, `vite.dev/llms.txt`, `expressjs.com/llms.txt`.

**Drizzle-Warnung:** `llms.txt` beschreibt `drizzle-kit migrate`. Bei uns **falsch** — Migrationen sind raw SQL in `apps/api/database/postgres/migrations/`, ausgeführt von `PostgresService.init()`. Die Schema-Dateien sind nur Typquelle.

## Nur klassische Doku (kein Skill, kein `llms.txt`)

Alle Links unten sind geprüft (HTTP 200, Stand 30.07.2026). Kein `llms.txt` heißt: per WebFetch die passende Unterseite holen, nicht die ganze Site — und bei Zweifeln `node_modules/<pkg>/**/*.d.ts` lesen, das ist immer versionsgenau.

**Backend**

| Paket | Doku |
| --- | --- |
| `@opentelemetry/*` | https://opentelemetry.io/docs/languages/js/ |
| `crawlee` | https://crawlee.dev/js/docs/quick-start |
| `apify-client` | https://docs.apify.com/api/client/js/ |
| `@ts-rest/core`, `@ts-rest/express` | https://ts-rest.com/ — **alle `/docs/*`-Pfade sind 404**, die Startseite ist der Einstieg; sonst https://github.com/ts-rest/ts-rest |
| `pdf-lib` | https://pdf-lib.js.org/ |
| `pdfjs-dist` | https://mozilla.github.io/pdf.js/getting_started/ |
| `pptxgenjs` | https://gitbrent.github.io/PptxGenJS/ |
| `docx` | https://docx.js.org/ |
| `sharp` | https://sharp.pixelplumbing.com/ |
| `@napi-rs/canvas` | https://github.com/Brooooooklyn/canvas |
| `pg` | https://node-postgres.com/ |
| `ioredis` | https://github.com/redis/ioredis |
| `redis` (node-redis) | https://github.com/redis/node-redis |
| `jose` | https://github.com/panva/jose |
| `openai` | https://platform.openai.com/docs/api-reference |
| `@tus/server`, `@tus/file-store` | https://tus.io/protocols/resumable-upload · https://github.com/tus/tus-node-server |

**Frontend & Packages**

| Paket | Doku |
| --- | --- |
| `@blocknote/*` (7 Pakete) | https://github.com/TypeCellOS/BlockNote — `blocknote.dev` war beim Prüfen nicht erreichbar, Repo ist die belastbare Quelle |
| `@excalidraw/excalidraw`, `y-excalidraw` | https://docs.excalidraw.com/ |
| `reveal.js`, `@revealjs/react` | https://revealjs.com/ |
| `recharts` | https://recharts.org/ — **`/en-US/*`-Pfade sind 404**, nur die Startseite lädt |
| `konva`, `react-konva`, `use-image` | https://konvajs.org/docs/ (+ `konvajs.org/llms.txt`) |
| `@radix-ui/*`, `radix-ui` | https://www.radix-ui.com/primitives/docs/overview/introduction |
| `@base-ui/react` | https://base-ui.com/react/overview/quick-start — Base UI ist der Radix-Nachfolger, beide sind parallel im Repo |
| `@dnd-kit/*` | https://docs.dndkit.com/ |
| `@tanstack/react-query`, `-table`, `-virtual` | https://tanstack.com/query/latest/docs/framework/react/overview (+ `tanstack.com/llms.txt`) |
| `@tauri-apps/*` | https://v2.tauri.app/start/ |
| `onnxruntime-web` | https://onnxruntime.ai/docs/api/js/index.html |
| `@imgly/background-removal` | https://github.com/imgly/background-removal-js · https://img.ly/docs/cesdk/ |
| `pyodide` | https://pyodide.org/en/stable/ |
| `xlsx` (SheetJS) | https://docs.sheetjs.com/ |
| `@react-pdf/renderer` | https://react-pdf.org/ |
| `zustand` | https://github.com/pmndrs/zustand — `zustand.docs.pmnd.rs` löst nicht auf |
| `jotai` | https://jotai.org/docs/introduction |
| `shiki` | https://shiki.style/guide/ |
| `beautiful-mermaid` | https://mermaid.js.org/intro/ |
| `katex` | https://katex.org/docs/supported |
| `@playwright/test` | https://playwright.dev/docs/intro |
| `msw` | https://mswjs.io/docs/ — unsere Konventionen in `apps/web/CLAUDE-testing.md` |
| `motion` | https://motion.dev/docs (+ `motion.dev/llms.txt`) |
| `tus-js-client` | https://github.com/tus/tus-js-client |
| `@iconify/*` | https://iconify.design/docs/ |

## Mehrfach vorhandene Stacks — welcher gilt

Ausgezählt am 30.07.2026 über Imports (ohne `node_modules`). Wichtig, weil `package.json` hier mehr Auswahl suggeriert, als es tatsächlich gibt:

| Bereich | Standard | Ausnahme |
| --- | --- | --- |
| **State** | `zustand` — **58** Dateien | `jotai` — **3** Dateien, alle unter `apps/web/src/components/kibo-ui/`. Kein App-State: die vendorten kibo-ui-Komponenten bringen Jotai selbst mit. Für neuen State immer Zustand |
| **Redis** | `redis` (node-redis) — **5** Dateien, u. a. `utils/redis/client.ts`, `notificationPubSub.ts`, `services/hocuspocus/src/redis.ts` | `ioredis` — **genau 1** Datei: `apps/api/workers/aiClient.ts`. Die `isReady`-Guard-Regel bezieht sich auf node-redis |
| **Headless UI** | `radix-ui` (unified) — **33** Dateien | Einzelpakete `@radix-ui/react-slider` / `-slot` / `-tooltip` in **8** Dateien; `@base-ui/react` in **1**: `packages/ui/src/components/combobox.tsx`. Neues UI gegen `radix-ui` bauen |
| **PDF** | `pdf-lib` — **9** Dateien, Erzeugung im Backend | `pdfjs-dist` ist **kein** Duplikat: nur Lesen/OCR in den Scrapern (`scrape-bayern.ts`, `scrape-thueringen.ts`) über den Subpath `pdfjs-dist/legacy/build/pdf.mjs` |

**Zwei PDF-Dependencies sind tot:**

- `@blocknote/xl-pdf-exporter` — bewusst durch den Server-Renderer (`POST /api/exports/pdf`) ersetzt, weil der Client-Pfad untagged PDFs ohne CI und ohne Briefkopf erzeugte. Steht nur noch in einem Kommentar in `DocsEditorPage.tsx`.
- `@react-pdf/renderer` — **null** Referenzen im gesamten Repo.

Aktiv genutzt und nicht verwechseln: `@blocknote/xl-docx-exporter` und `@blocknote/xl-odt-exporter` (dynamische Imports in `DocsEditorPage.tsx` / `useDocsLiveWolkeSync.ts`).
