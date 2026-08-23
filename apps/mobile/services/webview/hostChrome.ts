/**
 * Which embedded surfaces bring their own header — and must therefore not get a
 * second one from the host.
 *
 * The web app's editors are not chrome-less in embedded mode: they keep their
 * own top bar, because that bar carries the document title, the collaborator
 * avatars and the way out (`useHostAwareBack`, which posts `CLOSE` and so pops
 * this screen). Drawing the host header above it stacks two title bars with two
 * back affordances on a phone screen — and the lower one is the one that works
 * on the document.
 *
 * So for these paths the host contributes nothing but the status-bar inset, and
 * the page owns the top of the screen.
 *
 * The list is a prefix match against the same paths the `web-viewer` callers
 * pass, and is deliberately a *subset* of the API's `EMBEDDABLE_PATH_PREFIXES`:
 * a surface without its own back button (a notebook, a text) would be a trap
 * without the host header, since nothing else leaves this screen. The guard in
 * `hostChrome.vitest.ts` checks the other half — that each entry here really
 * does have a `useHostAwareBack` in the web page that draws its header.
 */
export const SELF_CHROMED_PATH_PREFIXES: readonly string[] = [
  // `BoardInlineHeader` — back arrow, title, presence, board menu.
  '/boards/',
  // The office dispatcher's three editors (text, sheet, presentation), all
  // through the shared `EditorTopBar` with `onBack`.
  '/office/',
  // `CollabCanvasStudioPage` — the canvas editor's green menu bar.
  '/studio/canvas/',
];

/**
 * Does the host draw its own header for this path?
 *
 * Takes the raw `path` param (query string and all) — the prefixes are matched
 * against the pathname alone, so `/datenbank/vorlagen?selected=…` is judged by
 * `/datenbank/vorlagen`.
 */
export function hostDrawsHeader(path: string): boolean {
  const pathname = path.split('?')[0] ?? '';
  return !SELF_CHROMED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * The canvas editor's menu bar is a horizontal gradient, not a flat colour, so
 * the status-bar band above it has to be one too — a single green would seam
 * against it on the right, where the bar has already run to `#6BA88C`.
 *
 * Copied from `--editor-menubar-gradient` in the canvas editor's
 * `variables.css`, which is where it belongs: it is a web design token, and
 * that file stays its one source. `hostChrome.vitest.ts` reads the CSS and
 * fails if the two drift apart, so this is checked duplication rather than the
 * kind that quietly rots.
 */
export const CANVAS_MENUBAR_GRADIENT = ['#00553B', '#3E7D63', '#6BA88C'] as const;

/** Where the three stops sit — `55%` in the CSS. */
export const CANVAS_MENUBAR_GRADIENT_STOPS = [0, 0.55, 1] as const;

/**
 * The colours the host paints behind the status bar, or `null` for "the plain
 * theme background".
 *
 * Only the canvas editor needs a tint: board and office draw their headers on
 * the ordinary page background, which is what the host already uses. The status
 * bar itself stays visible on every self-chromed surface — on a device with a
 * cutout that band is reserved anyway (34.33 dp on a Galaxy S24, against a
 * 24 dp status bar), so hiding it buys nothing and costs the clock.
 */
export function statusBarTint(path: string): readonly string[] | null {
  const pathname = path.split('?')[0] ?? '';
  return pathname.startsWith('/studio/canvas/') ? CANVAS_MENUBAR_GRADIENT : null;
}
