/**
 * The message contract between an embedded web page and its native WebView
 * host (`apps/mobile`).
 *
 * One definition shared by both sides. The precedent this replaces —
 * `apps/web/src/pages/MobileEditorPage.tsx` and
 * `apps/mobile/components/image-studio/WebViewEditor.tsx` — declares the same
 * message shapes twice, by hand, and the two already disagree (the web side
 * receives an `authToken` it never uses).
 *
 * These messages exist so an embedded page can ask the host to do the things
 * it must NOT do itself: navigating away or showing a login screen inside a
 * WebView that is pinned to one page. See `isEmbedded()` in
 * `apps/web/src/utils/platform.ts`.
 */

/** Sent by the embedded page to its native host. */
export type WebViewOutboundMessage =
  | {
      /** The page's own "back"/"cancel" affordance. The host closes the WebView. */
      type: 'CLOSE';
    }
  | {
      /**
       * The page's session is gone. The host must close the WebView and
       * refresh its own token — the page must not redirect to /login, which
       * would strand the user on an auth screen with no way back.
       */
      type: 'SESSION_LOST';
    };

export type WebViewOutboundMessageType = WebViewOutboundMessage['type'];

interface ReactNativeWebViewHost {
  postMessage: (message: string) => void;
}

function nativeHost(): ReactNativeWebViewHost | null {
  if (typeof window === 'undefined') return null;
  const host = (window as { ReactNativeWebView?: ReactNativeWebViewHost }).ReactNativeWebView;
  return host ?? null;
}

/** True when a react-native-webview host is present to receive messages. */
export function hasNativeHost(): boolean {
  return nativeHost() !== null;
}

/**
 * Posts a message to the native host. No-op outside a WebView, so callers can
 * use it unconditionally on an embedded code path.
 */
export function postToNativeHost(message: WebViewOutboundMessage): void {
  nativeHost()?.postMessage(JSON.stringify(message));
}

/**
 * Parses a message received from an embedded page.
 *
 * Returns null for anything unrecognised: a WebView receives messages from the
 * page it hosts, and a page can be navigated (or injected into), so the host
 * must not trust the payload's shape.
 */
export function parseWebViewMessage(raw: unknown): WebViewOutboundMessage | null {
  let candidate: unknown = raw;
  if (typeof raw === 'string') {
    try {
      candidate = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof candidate !== 'object' || candidate === null) return null;
  const type = (candidate as { type?: unknown }).type;
  // Keep the discriminant access inline rather than destructuring, so each
  // branch narrows on its own (repo convention for discriminated unions).
  if (type === 'CLOSE') return { type: 'CLOSE' };
  if (type === 'SESSION_LOST') return { type: 'SESSION_LOST' };
  return null;
}
