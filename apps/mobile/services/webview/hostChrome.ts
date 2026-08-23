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
