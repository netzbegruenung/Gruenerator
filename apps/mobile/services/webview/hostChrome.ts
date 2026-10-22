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
  // `CollabCanvasStudioPage` — the canvas editor's menu bar (native in the app,
  // see `hostDrawsEditorBar`).
  '/studio/canvas/',
  // `SharepicVorlageInstantiatePage` — shows the canvas editor's skeleton while
  // it copies the Vorlage, then replaces itself with `/studio/canvas/:id`.
  '/studio/vorlage/',
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
 * Surfaces whose top bar the host draws natively — close, title, undo/redo,
 * share — in system colours, with the page reporting state over the bridge
 * (`HOST_CAPABILITY_EDITOR_CHROME`). A subset of the self-chromed list: the
 * page keeps its own bar, and its way out, for app binaries that predate this.
 */
const NATIVE_EDITOR_BAR_PATH_PREFIXES: readonly string[] = ['/studio/canvas/', '/studio/vorlage/'];

/** Does the host draw the native editor bar for this path? Takes the raw `path` param. */
export function hostDrawsEditorBar(path: string): boolean {
  const pathname = path.split('?')[0] ?? '';
  return NATIVE_EDITOR_BAR_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * The shape of the surface behind the WebView, for the loading placeholder.
 *
 * A skeleton is a promise about the layout, so it may only be drawn where the
 * layout is actually known. For the self-chromed surfaces it is: each one is a
 * single page with a fixed frame, described where its prefix is listed above.
 * Everything else that reaches this screen is a different page every time — a
 * notebook, a text, a generator form, the template catalogue — and shares
 * nothing but the host header. Those get `null` and keep a plain spinner;
 * inventing a body for them would promise a layout and then break it.
 *
 * `/office/` is one shape although the path serves three editors: `CollabDocRoute`
 * picks text, sheet or presentation by `document_subtype`, which is not in the
 * URL. What is certain either way is the shared `EditorTopBar` and a body
 * beneath it, so that is all the skeleton claims.
 */
export type EmbeddedSurfaceShape = 'board' | 'office' | 'canvas';

/**
 * Prefix → shape. Keyed by the same strings as `SELF_CHROMED_PATH_PREFIXES`;
 * `hostChrome.vitest.ts` fails if a prefix is added there without a shape here,
 * which is the way a new surface would otherwise silently fall back to a
 * spinner over an empty screen.
 */
const SURFACE_SHAPES: Record<string, EmbeddedSurfaceShape> = {
  '/boards/': 'board',
  '/office/': 'office',
  '/studio/canvas/': 'canvas',
  '/studio/vorlage/': 'canvas',
};

/**
 * Which skeleton to draw for this path, or `null` for "draw none — we do not
 * know this page's layout". Takes the raw `path` param, query string and all.
 */
export function embeddedSurfaceShape(path: string): EmbeddedSurfaceShape | null {
  const pathname = path.split('?')[0] ?? '';
  const prefix = SELF_CHROMED_PATH_PREFIXES.find((p) => pathname.startsWith(p));
  return prefix ? (SURFACE_SHAPES[prefix] ?? null) : null;
}
