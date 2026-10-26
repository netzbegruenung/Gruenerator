/**
 * Which embedded surfaces are editors — and get the host's full native editor
 * bar rather than the plain one.
 *
 * The host draws the header natively on every surface. On these, the page
 * reports its title, undo/redo, share and further actions over the bridge
 * (`HOST_CAPABILITY_EDITOR_CHROME`, page side `useNativeEditorBar`), and the bar
 * turns them into buttons and a "…" menu. Everywhere else the bar carries the
 * caller's title and the way out, nothing more.
 *
 * The pages behind these prefixes still draw a bar of their own when the host
 * does not announce the capability — for app binaries that predate it. That
 * bar carries their way out (`useHostAwareBack`, which posts `CLOSE` and so
 * pops this screen); the guard in `hostChrome.vitest.ts` checks each entry
 * here really does have one.
 *
 * The list is a prefix match against the same paths the `web-viewer` callers
 * pass, and a subset of the API's `EMBEDDABLE_PATH_PREFIXES`.
 */
export const SELF_CHROMED_PATH_PREFIXES: readonly string[] = [
  // `BoardInlineHeader` — back arrow, title, presence, board menu.
  '/boards/',
  // The office dispatcher's three editors (text, sheet, presentation), all
  // through the shared `EditorTopBar` with `onBack`.
  '/office/',
  // `CollabCanvasStudioPage` — the canvas editor's menu bar.
  '/studio/canvas/',
  // `SharepicVorlageInstantiatePage` — shows the canvas editor's skeleton while
  // it copies the Vorlage, then replaces itself with `/studio/canvas/:id`.
  '/studio/vorlage/',
];

function selfChromedPrefix(path: string): string | null {
  const pathname = path.split('?')[0] ?? '';
  return SELF_CHROMED_PATH_PREFIXES.find((prefix) => pathname.startsWith(prefix)) ?? null;
}

/** The editor bar for an editor, the plain bar (title and close) for anything else. */
export type HeaderKind = 'editor' | 'plain';

/**
 * Which bar the host draws for this path. Takes the raw `path` param — the
 * prefixes are matched against the pathname alone, so `/boards/abc?tab=archiv`
 * is judged by `/boards/abc`.
 */
export function headerKind(path: string): HeaderKind {
  return selfChromedPrefix(path) === null ? 'plain' : 'editor';
}

/**
 * The shape of the surface behind the WebView, for the loading placeholder.
 *
 * A skeleton is a promise about the layout, so it may only be drawn where the
 * layout is actually known. For the editors it is: each one is a single page
 * with a fixed frame, described where its prefix is listed above. Everything
 * else that reaches this screen is a different page every time — a notebook, a
 * text, a generator form, the template catalogue — and shares nothing but the
 * host bar. Those get `null` and keep a plain spinner; inventing a body for
 * them would promise a layout and then break it.
 *
 * `/office/` is one shape although the path serves three editors: `CollabDocRoute`
 * picks text, sheet or presentation by `document_subtype`, which is not in the
 * URL. What is certain either way is a body beneath the bar, so that is all the
 * skeleton claims.
 */
export type EmbeddedSurfaceShape = 'board' | 'office' | 'canvas';

/**
 * Prefix → shape and the title the bar shows until the page reports its own
 * (callers usually pass one). Keyed by the same strings as
 * `SELF_CHROMED_PATH_PREFIXES`; `hostChrome.vitest.ts` fails if a prefix is
 * added there without an entry here, which is the way a new surface would
 * otherwise silently fall back to a spinner over an empty screen.
 */
const SURFACES: Record<string, { shape: EmbeddedSurfaceShape; title: string }> = {
  '/boards/': { shape: 'board', title: 'Board' },
  '/office/': { shape: 'office', title: 'Dokument' },
  '/studio/canvas/': { shape: 'canvas', title: 'Sharepic' },
  '/studio/vorlage/': { shape: 'canvas', title: 'Sharepic' },
};

/**
 * Which skeleton to draw for this path, or `null` for "draw none — we do not
 * know this page's layout". Takes the raw `path` param, query string and all.
 */
export function embeddedSurfaceShape(path: string): EmbeddedSurfaceShape | null {
  const prefix = selfChromedPrefix(path);
  return prefix ? (SURFACES[prefix]?.shape ?? null) : null;
}

/** The bar's title when the caller passed none and the page has not reported one. */
export function fallbackTitle(path: string): string {
  const prefix = selfChromedPrefix(path);
  return (prefix && SURFACES[prefix]?.title) || 'Web';
}
