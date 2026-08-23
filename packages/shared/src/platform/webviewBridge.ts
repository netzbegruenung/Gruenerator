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
 * it must NOT do itself: navigating away, showing a login screen, or handing
 * the user a file — all three are impossible inside a WebView pinned to one
 * page. See `isEmbedded()` in `apps/web/src/utils/platform.ts`.
 *
 * Hand-written rather than a zod schema. NOT because the file is
 * dependency-free — it is not: `apps/mobile` imports it through the
 * `@gruenerator/shared` root barrel, which pulls in `./api` → contracts → zod,
 * so zod is already in the mobile bundle. The reason is narrower: `shared`
 * uses zod in two files without declaring it, and adding a third undeclared
 * import would extend that. Declaring it properly is a lockfile change; worth
 * doing, but not from inside this PR.
 *
 * What the parser must keep either way is the property the tests pin:
 * every branch RECONSTRUCTS its message instead of passing the candidate
 * through, and unknown fields are dropped rather than rejected — an older app
 * binary has to keep understanding a newer page.
 */

/**
 * Largest `DOWNLOAD_FILE` payload the host will accept, in base64 characters
 * (~9 MB of actual bytes).
 *
 * A cap is needed because `postMessage` is a string channel: an oversized
 * payload does not fail cleanly, it stalls the bridge. The limit is generous
 * enough for any single sharepic — the shipped `SAVE_IMAGE` path already sends
 * full-resolution base64 images this way — but a multi-page ZIP at pixelRatio 3
 * can exceed it, which is why the sender must handle the rejection rather than
 * assume it fits.
 */
export const WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH = 12 * 1024 * 1024;

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
    }
  | {
      /**
       * A file the page produced and cannot deliver itself: a synthetic
       * `<a download>` click is silently ignored by WKWebView, and our own
       * navigation policy blocks the `data:` scheme on Android. The host writes
       * it to the gallery or opens the share sheet.
       */
      type: 'DOWNLOAD_FILE';
      /**
       * Base name only — the host turns it into a real path. Never contains a
       * path separator; see `isSafeDownloadFilename`.
       */
      filename: string;
      /** MIME type, used by the host to pick gallery vs. share sheet. */
      mime: string;
      /** Base64 payload WITHOUT the `data:<mime>;base64,` prefix. */
      data: string;
    };

export type WebViewOutboundMessageType = WebViewOutboundMessage['type'];

/**
 * A `DOWNLOAD_FILE` filename becomes a path on the host (`new File(Paths.cache, …)`),
 * so a page that is navigated or injected into must not be able to steer where
 * that write lands. Base names only.
 *
 * Spaces are allowed on purpose — real export names carry them
 * (`Haushalt 2027.pptx`).
 */
export function isSafeDownloadFilename(value: string): boolean {
  if (value.length === 0 || value.length > 255) return false;
  if (value.includes('/') || value.includes('\\')) return false;
  // C0 range and DEL. A NUL truncates the path in several native APIs, and
  // CR/LF have no business in a file name.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  // Rejects `..` and `.` outright: a name made only of dots addresses a
  // directory, never a file.
  return value.replace(/\./g, '').trim().length > 0;
}

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
 *
 * Every branch RECONSTRUCTS its message rather than passing the candidate
 * through, so no unexpected field can ride along into host code.
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
  if (type === 'DOWNLOAD_FILE') {
    const filename = (candidate as { filename?: unknown }).filename;
    const mime = (candidate as { mime?: unknown }).mime;
    const data = (candidate as { data?: unknown }).data;
    if (typeof filename !== 'string' || !isSafeDownloadFilename(filename)) return null;
    if (typeof mime !== 'string' || mime.length === 0) return null;
    if (typeof data !== 'string' || data.length === 0) return null;
    if (data.length > WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH) return null;
    // The base64 alphabet is deliberately NOT checked here: scanning a payload of
    // this size to answer a question the host's decoder answers anyway would cost
    // more than it protects. The host treats a decode failure as a failed
    // download.
    return { type: 'DOWNLOAD_FILE', filename, mime, data };
  }
  return null;
}
