/**
 * Navigation policy for the pinned in-app WebView.
 *
 * A pure function, deliberately separate from the screen: this is the piece
 * that decides whether the user can leave the page we opened, so it should be
 * testable without a device.
 *
 * Why `onShouldStartLoadWithRequest` and not `originWhitelist`: per
 * react-native-webview's own docs, an origin that is NOT on the whitelist is
 * handed to the **system browser** — a whitelist escalates rather than blocks,
 * which is the opposite of containment. Only returning `false` from
 * `onShouldStartLoadWithRequest` actually stops a navigation.
 */

/**
 * The `originWhitelist` the pinned WebView passes — deliberately everything.
 *
 * Counter-intuitive on a screen built for containment, and load-bearing. Read
 * `createOnShouldStartLoadWithRequest` in react-native-webview's
 * `WebViewShared.tsx`: a URL that fails the whitelist is passed to
 * `Linking.openURL` and `shouldStart` is set to `false` — **the
 * `onShouldStartLoadWithRequest` handler is never called at all**. The
 * whitelist does not merely fail to block; it pre-empts the thing that does.
 *
 * Narrowing it is also a trap that looks correct. The whitelist is matched
 * against `extractOrigin(url)`, which yields `https://gruenerator.eu` — no
 * trailing slash. A natural-looking `'https://gruenerator.eu/*'` compiles to
 * `^https://gruenerator\.eu/.*`, needs that slash, and therefore matches
 * nothing: every navigation escapes to the system browser. That is exactly
 * what shipped on 15.08.2026 and what made canvases open in Chrome.
 * Dropping the `/*` trades one flaw for another — the compiled pattern is an
 * unanchored prefix, so `https://gruenerator.eu.evil.com` passes it too.
 *
 * So the whitelist cannot express what we need in either direction, and the
 * only safe setting is the one that always hands the decision to
 * `decideNavigation` below, which compares origins exactly and knows that
 * `intent:` must be dropped rather than forwarded to the system.
 */
// Mutable `string[]` rather than `readonly`: that is what the WebView prop
// takes, and a `readonly` array does not assign to it.
export const WEBVIEW_ORIGIN_WHITELIST: string[] = ['*'];

/** What the host should do with a navigation the WebView is about to start. */
export type NavigationDecision =
  /** Let the WebView navigate. */
  | 'allow'
  /** Drop it silently — the user stays on the pinned page. */
  | 'block'
  /** Not ours: hand it to the system browser, outside the WebView. */
  | 'external';

/** The subset of `ShouldStartLoadRequest` this decision needs. */
export interface NavigationRequest {
  url: string;
  /**
   * `false` for iframes and sub-resources. Optional because Android reports
   * only some of the fields iOS does.
   */
  isTopFrame?: boolean;
}

export interface NavigationPolicy {
  /** Origin the embedded page lives on, e.g. `https://gruenerator.eu`. */
  origin: string;
  /**
   * Paths the WebView may navigate to. Everything else on the same origin is
   * blocked — the WebView shows one screen, not the whole app.
   */
  allowedPathPrefixes: readonly string[];
}

// Anything that is not a normal web navigation. `about:blank` shows up as an
// intermediate step in some redirect chains, hence its own allowance below.
const NON_HTTP_SCHEME = /^(?!https?:)[a-z][a-z0-9+.-]*:/i;

export function decideNavigation(
  request: NavigationRequest,
  policy: NavigationPolicy
): NavigationDecision {
  const { url } = request;

  // Sub-resources and iframes are not navigation — gating them would break
  // fonts, images and the collab websocket handshake page.
  if (request.isTopFrame === false) return 'allow';

  // The initial load of a fresh WebView, and a step in some redirect chains.
  if (url === 'about:blank') return 'allow';

  // `javascript:`, `data:`, `intent:`, `tel:`, custom app schemes. Never
  // navigate to these and never hand them to the system browser either —
  // `intent:` in particular can launch arbitrary Android activities.
  if (NON_HTTP_SCHEME.test(url)) return 'block';

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'block';
  }

  // A different site: legitimate outbound links (the editor renders Unsplash
  // attribution with target="_blank") open outside, so the user never loses
  // the pinned page and never browses the web inside our WebView.
  if (parsed.origin !== policy.origin) return 'external';

  // Same origin, but the app's own API — the page needs it (form posts,
  // downloads, the handoff redirect itself).
  if (parsed.pathname.startsWith('/api/')) return 'allow';

  if (policy.allowedPathPrefixes.some((prefix) => parsed.pathname.startsWith(prefix))) {
    return 'allow';
  }

  // Same origin, unlisted path: this is the app trying to navigate us into its
  // own chrome (back button, login redirect, a link in a banner).
  return 'block';
}
