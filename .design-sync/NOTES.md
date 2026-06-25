# design-sync NOTES — @gruenerator/ui

Repo-specific gotchas for syncing `@gruenerator/ui` to claude.ai/design. Read this first on every re-sync.

## Brand (from the user)
- **Main font: Raleway** (headings). Body text is **PT Sans**. Decorative: **GrueneType** / GrueneTypeNeue (Die Grünen logo type).
- **Main color: Eucalyptus** (`--secondary-600: #5F8575`, "Eucalyptus") and **green** (`--primary-500: #52907A`). Brand greens like `--klee` (= primary-500) and `--tanne` (dark fir green) come from Die Grünen.
- The canonical CSS/design system lives in the **main repo** at `apps/web/src/assets/styles/` (Tailwind v4 `@theme` in `index.css`, token values in `common/variables.css`).

## Build shape
- `@gruenerator/ui` ships **no compiled dist and no build script** — `exports['.'].import = ./src/index.ts` (TS source). The converter bundles that entry directly via esbuild; props come from ts-morph on the `.tsx` source. Pass `--entry ./packages/ui/src/index.ts` (config has `entry` set) — without it, PKG_DIR defaults to `node_modules/@gruenerator/ui`, which doesn't exist (pnpm workspace) → ENOENT.

## ⚠️ CRITICAL: `--node-modules` must point at the matched-React scratch install
- The repo has a **react/react-dom version mismatch** (one of the "inconsistencies"): root `node_modules/react@19.2.6` but root `node_modules/react-dom@19.2.7` (and `packages/ui/node_modules/react@19.2.7`). React's internals are version-locked, so the converter's `vendorReact` (esbuild-bundles react+react-dom+react-dom/client into `_vendor/react.js` because React 19 has no UMD) throws `Cannot read properties of undefined (reading 'S')` (`ReactSharedInternals`) when it merges `react-dom/client`. The merge is in a `try/catch`, so it fails **silently**: `window.ReactDOM.createRoot` ends up `undefined` → EVERY preview card fails to render. Floor cards mask it (their catch shows the typographic fallback), so the render check still passes — but authored cards show `⚠ ReactDOM.createRoot is not a function`.
- **Fix:** point `--node-modules` at an isolated scratch install of a *coherent* pair:
  ```sh
  mkdir -p .design-sync/.cache/vendor-install && cd .design-sync/.cache/vendor-install
  echo '{"name":"ds-vendor-react","private":true}' > package.json
  npm i react@19.2.7 react-dom@19.2.7
  ```
  Then build/validate/capture/resync with `--node-modules ./.design-sync/.cache/vendor-install/node_modules`. The component bundle's other deps (radix, recharts, motion…) resolve **entry-relative** from `packages/ui/src` → `packages/ui/node_modules`, so the sparse scratch nodePaths doesn't break them (verified: 229 components, 115 inlined externals, all resolve). react/react-dom are shimmed to window globals in the component bundle, so only `vendorReact` consumes the scratch react pair.
- Symlinking root's react-dom into a scratch does NOT work: esbuild follows the symlink to root's real path and resolves react-dom's internal `require("react")` back to root `19.2.6`. You need a real coherent install.
- `.cache/` is gitignored, so a **fresh clone must recreate this scratch install** before re-syncing. (If the repo ever aligns react==react-dom, plain `--node-modules ./node_modules` would work again.)
- **229 exports** counted as components (~80 logical components + their compound sub-parts: AccordionContent, DialogTrigger, SelectItem, etc.). All ship functional + `.d.ts`; meaningful top-level components get authored previews, sub-parts get floor cards (composed inside their parent's preview).

## CSS — compiled, not shipped
- `@gruenerator/ui` has zero CSS files; it's pure Tailwind v4 utilities referencing theme tokens. The design environment serves `styles.css` statically (no Tailwind build), so we **pre-compile** via `cfg.buildCmd` = `node .design-sync/build-css.mjs` → `packages/ui/dist/ds-styles.css` (gitignored), wired as `cfg.cssEntry`. **Run build-css before package-build on every sync** (buildCmd handles this).
- build-css.mjs starts from `apps/web/.../index.css` and tightens to ui: (1) rewrites `@import url('x')` → bare `@import "x"` (Tailwind only inlines the bare form, else token values go missing); (2) keeps only foundational imports (tailwindcss + common/{reset,variables,typography,global}.css), dropping app-chrome + other-package CSS; (3) `@import "tailwindcss" source(none)` + a single `@source packages/ui/src` so Tailwind emits ONLY ui's classes (without source(none) it auto-scans apps/web and leaks classes like `bg-[var(--tanne)]`); (4) strips `@font-face` (fonts ship via cfg.extraFonts).

## Fonts
- `cfg.extraFonts` → `../../apps/web/src/assets/styles/common/typography.css`; converter parses its @font-face and copies the woff2 from `apps/web/src/assets/fonts/` into the bundle `fonts/` (14 @font-face rules).

## Known inconsistencies (the user confirmed "there may be inconsistencies")
- `--tanne` is referenced by some apps/web feature files via `[var(--tanne)]` but **defined nowhere in the repo** — dangling in the app too. Scoped out by `source(none)` (only ui classes ship), so not in the DS stylesheet. Do NOT invent a value to "fix" it — sync faithfully.

## Known render warns (triaged — re-syncs check against this list)
- `[TOKENS_MISSING]` ~37 vars: mostly runtime-set (`--radix-*` set by Radix, `--skeleton-width` set inline by Skeleton) or legacy app vars. Non-blocking; verify a rendered preview before chasing any specific one.

## Component authoring learnings (folded from waves)
- **`max-w-{xs,sm,md,lg,xl}` resolve to `--spacing-*` (~8–14px), NOT container widths.** The repo defines named spacing tokens (`--spacing-sm` etc.) AND a container scale (`--container-sm`) in `@theme`, and Tailwind v4 prefers the spacing namespace for `max-w-*` — so `.max-w-sm { max-width: var(--spacing-sm) }`. This is **faithful to the web app** (its compiled CSS is identical — verified), so it is NOT fixed in the bundle. It only bites at the `sm:` breakpoint (≥640px viewport). For previews/compositions that hit it, set an explicit inline `width`/`maxWidth` (e.g. Sheet, EmptyHeader). The conventions header tells the design agent to use `max-w-[Npx]`/inline width for container widths.
- **Overlays render via controlled `open`/`defaultOpen`** (Select/Combobox/DropdownMenu/ContextMenu/Popover/Tooltip/AlertDialog/Sheet) — already pinned `cardMode:single`. Tooltip needs `<TooltipProvider>`. Combobox is **Base UI** (`@base-ui/react`), not Radix: `open` + an `items` array on the root, `ComboboxInput` is the anchor. Popover exports only Popover/Content/Trigger/Anchor (no Header/Title sub-parts).
- **LiteTooltip** is hover-only (internal `useState`, no `open` prop) — its bubble can't render statically; preview shows resting triggers. No override.
- **ResponsiveMenu** switches DropdownMenu/Sheet via `useIsMobile()` and only portals on interaction → no static surface; preview composes its building blocks on an inline-styled surface.
- **MultiStepForm** renders only the active `MultiStepForm.Step`; pass `onBack` for the back arrow on step > 0. Static no-op handlers are fine.
- **Toaster** (sonner): fire toasts on mount; use `position="top-center"` so they don't clip a short bottom-anchored viewport.
- **Calendar**: localize German via inline `formatters.formatCaption`/`formatWeekdayName` + `weekStartsOn={1}` — do NOT import a date-fns locale (unnecessary; risky in the vendor sandbox).
- **Interactive-but-prop-driven** components (DotIndicators, PillGroup, Toggle, Checkbox) render their active/selected state from props with `() => {}` handlers — captures cleanly.
- **NotificationBell** uses Radix Tooltip internally but ships NO TooltipProvider — renders blank unless wrapped in `<TooltipProvider>` (exported from the package). Its preview wraps it.
- **Popover/Sheet-based components with internal-only open state** (CardActionsMenu, SmartInput, SettingsDropdown, SettingsTagInput) have NO `open`/`defaultOpen` prop, so their surface can't render statically — previews show the resting/closed trigger (the open surface is covered by the DropdownMenu/Popover previews). `cardMode:single` does NOT help these; leave default.
- **VideoCard / FeatureCard / FileCard** have no intrinsic width (aspect-ratio on a 100%-width box) → collapse to 0 in `display:flex` rows; give cards an explicit inline `width`. Child SVG icons need explicit width/height.
- **PreviewImage** needs a sized parent + a real `src` (fades from opacity-0 on `<img onLoad>`). `picsum.photos/seed/<word>/W/H` works in capture.
- **TypingAnimation**: `startOnView={false}` + `duration={0}` so the timer-driven text completes during capture (capture's fixed-time doesn't pause setTimeout).
- **ChartContainer (recharts)**: recharts is double-bundled in the PREVIEW build (UI global has ResponsiveContainer; the preview's `import from 'recharts'` resolves a second copy from root node_modules) → ResponsiveContainer measures `width(-1)` → blank. Preview-only fix: pass explicit numeric `width`/`height` + `isAnimationActive={false}` to the chart. Does NOT affect the shipped bundle (design env uses the single bundled recharts). Optional future nicety: `cfg.storyImports.shim` mapping `recharts`→UI global.
- **ApprovalCard** receipt heading is hard-coded English in the component ("Approved"/"Denied") — not author-fixable; upstream nit.
- **JSX German quotes**: use matched `„…"` pairs; a lone `"` inside a double-quoted attribute breaks esbuild.

## Screen templates (workplace) — the "Screens" group
- 6 full-screen/section templates recreating `apps/web`'s `WorkplacePage` and its sections, live in `.design-sync/screens/` and ship as the **`screens`** card group: `WorkplacePage` (full home), `WorkplaceCreator`, `WorkplaceRecent`, `WorkplaceNotebooks`, `WorkplaceTools`, `WorkplaceFavorites`.
- **Why recreations, not the real components:** the actual workplace feature components (CreatorSection, RecentlyCreatedSection, NotebooksSection, ToolsSection…) are app-coupled (react-router, @tanstack/react-query + apiClient live data fetching, Zustand stores, @gruenerator/chat / NotebookEditor) — they can't render in the static design env. The templates are self-contained, built ONLY from synced `@gruenerator/ui` primitives + inline-styled layout.
- **Wiring:** `cfg.extraEntries: ["../../.design-sync/screens/index.ts"]` merges them into `window.GrueneratorUI`; `cfg.componentSrcMap` registers each as a component (discovery only reads the main entry, so extraEntries exports need this); `cfg.docsMap` points each at `.design-sync/screens/docs/<Name>.md` whose `category: Screens` frontmatter sets the card group; `cfg.overrides.<Name>` pins `cardMode:single` + a viewport.
- **Import quirk:** screen source files import from `'../../packages/ui/src/index'` (the relative package source), NOT `'@gruenerator/ui'` — the bare specifier won't resolve when bundled via extraEntries (no workspace symlink). esbuild dedupes the relative path with the main entry → single component copies. The PREVIEW files (`.design-sync/previews/Workplace*.tsx`) DO import `'@gruenerator/ui'` (the story-imports shim → window global).
- **Authoring gotchas:** `CardGrid columns="3"` collapses to 2 columns at the card viewport (responsive) — use an explicit inline `gridTemplateColumns: repeat(3, minmax(0,1fr))`. `VideoCard` poster needs a bounded cell (`aspect="square"` in a grid cell works); `ArticleCard.publishedAt` is parsed as a date → pass an ISO date (`"2026-06-24"`), not relative German text ("vor 2 Stunden" → "Invalid Date").
- **To add more screens:** drop `<Name>.tsx` in `screens/` (import from `../../packages/ui/src/index`), export it from `screens/index.ts`, add `componentSrcMap` + `docsMap` (+ stub doc with `category: Screens`) + `overrides` entries, author `previews/<Name>.tsx` (`import { <Name> } from '@gruenerator/ui'`), rebuild.

## Re-sync risks
- The screen templates (`.design-sync/screens/`) recreate app UI by hand — if the real WorkplacePage layout/sections change, these drift. They're decorative reference templates, not generated from the app, so re-syncs won't auto-update them.
- The compiled `ds-styles.css` is regenerated from apps/web's live theme — if the app's `index.css`/`variables.css` change, the DS stylesheet changes. build-css.mjs's import keep-list and the `source(none)` scoping are the assumptions; revisit if app styling is restructured.
