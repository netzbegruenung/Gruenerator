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
 * The render messages run the other way, and for the mirrored reason: the app
 * cannot draw a sharepic. That picture is produced by Konva in a DOM, and there
 * is no server-side renderer — so the host hands the canvas description to a
 * hidden page and gets a PNG back. `parseHostMessage` is that direction's
 * parser, with the same discipline.
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

/**
 * Bumped when a message shape changes so an older peer can no longer read it.
 *
 * Load-bearing because the two sides ship on different clocks: the render
 * WebView points at the DEPLOYED web app, so a phone carrying last month's
 * binary talks to today's page. The page announces this number in
 * `RENDER_HOST_READY`; a host that does not recognise it declines to send work
 * rather than waiting out a timeout on replies it cannot parse.
 */
export const WEBVIEW_PROTOCOL_VERSION = 1;

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
    }
  | {
      /**
       * The render page has mounted and its fonts are loaded. Until this
       * arrives the host holds requests back — a canvas rendered before
       * `document.fonts` settles comes out in fallback type, and a wrong
       * picture is worse than a late one.
       */
      type: 'RENDER_HOST_READY';
      protocolVersion: number;
    }
  | {
      /** A finished render, answering exactly one `RENDER_REQUEST`. */
      type: 'RENDER_RESULT';
      requestId: string;
      /** PNG data URL, as produced by the canvas capture. */
      image: string;
    }
  | {
      /**
       * A render that produced no image. `reason` is for the log, not for the
       * user — the host decides what to show and whether to retry.
       */
      type: 'RENDER_ERROR';
      requestId: string;
      reason: string;
    };

export type WebViewOutboundMessageType = WebViewOutboundMessage['type'];

/** Sent by the native host into the embedded page. */
export type WebViewInboundMessage = {
  /**
   * Render one sharepic variant offscreen and post the result back.
   *
   * `canvasType` and `initialProps` are the same two values the web app hands
   * its own preview renderer — which is the whole point of doing this in a
   * WebView instead of natively: one renderer, nothing to drift.
   */
  type: 'RENDER_REQUEST';
  requestId: string;
  canvasType: string;
  initialProps: Record<string, unknown>;
};

export type WebViewInboundMessageType = WebViewInboundMessage['type'];

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

const MAX_FILENAME_LENGTH = 255;

/**
 * Turns whatever a caller wants to name a file into something
 * `isSafeDownloadFilename` accepts.
 *
 * Collapses rather than rejects, deliberately: the names that reach here are
 * built from user-typed titles (`${docData.title}.docx`), and a document
 * called `Protokoll 12/2026` is ordinary. Rejecting it would fail the export
 * on the host — and fail it silently, because a posted message is not a
 * round trip and the web side never learns the host dropped it.
 *
 * The strict predicate stays: this is the caller-side repair, the host still
 * checks what it actually receives.
 */
export function sanitizeDownloadFilename(raw: string, fallback = 'Download'): string {
  // Path separators become a dash rather than vanishing, so `12/2026` stays
  // readable as `12-2026` instead of collapsing to `122026`.
  const flattened = raw.replace(/[/\\]/g, '-');
  // eslint-disable-next-line no-control-regex
  const cleaned = flattened.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  // A name made only of dots addresses a directory, never a file.
  if (cleaned.replace(/\./g, '').trim().length === 0) return fallback;
  if (cleaned.length <= MAX_FILENAME_LENGTH) return cleaned;

  // Over-long: keep the extension, cut the stem — a `.pptx` that lost its
  // suffix opens in nothing.
  const dot = cleaned.lastIndexOf('.');
  if (dot <= 0) return cleaned.slice(0, MAX_FILENAME_LENGTH);
  const extension = cleaned.slice(dot);
  const stemBudget = Math.max(1, MAX_FILENAME_LENGTH - extension.length);
  return cleaned.slice(0, stemBudget) + extension;
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
  if (type === 'RENDER_HOST_READY') {
    const protocolVersion = (candidate as { protocolVersion?: unknown }).protocolVersion;
    if (typeof protocolVersion !== 'number' || !Number.isFinite(protocolVersion)) return null;
    return { type: 'RENDER_HOST_READY', protocolVersion };
  }
  if (type === 'RENDER_RESULT') {
    const requestId = (candidate as { requestId?: unknown }).requestId;
    const image = (candidate as { image?: unknown }).image;
    if (typeof requestId !== 'string' || requestId.length === 0) return null;
    if (typeof image !== 'string' || image.length === 0) return null;
    // Same ceiling as a download, and for the same reason: this is a string
    // channel, and an oversized payload stalls it rather than failing cleanly.
    // Rejected, never truncated — half an image is not a smaller image, and the
    // host's error path already knows how to retry.
    if (image.length > WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH) return null;
    return { type: 'RENDER_RESULT', requestId, image };
  }
  if (type === 'RENDER_ERROR') {
    const requestId = (candidate as { requestId?: unknown }).requestId;
    const reason = (candidate as { reason?: unknown }).reason;
    if (typeof requestId !== 'string' || requestId.length === 0) return null;
    if (typeof reason !== 'string') return null;
    return { type: 'RENDER_ERROR', requestId, reason };
  }
  return null;
}

/**
 * Parses a message received by an embedded page from its host.
 *
 * The mirror of `parseWebViewMessage`, and needed for the same reason turned
 * around: a page listening on `window.message` hears every frame on the origin,
 * not only the host that embedded it.
 */
export function parseHostMessage(raw: unknown): WebViewInboundMessage | null {
  let candidate: unknown = raw;
  if (typeof raw === 'string') {
    try {
      candidate = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof candidate !== 'object' || candidate === null) return null;
  if ((candidate as { type?: unknown }).type !== 'RENDER_REQUEST') return null;
  const requestId = (candidate as { requestId?: unknown }).requestId;
  const canvasType = (candidate as { canvasType?: unknown }).canvasType;
  const initialProps = (candidate as { initialProps?: unknown }).initialProps;
  if (typeof requestId !== 'string' || requestId.length === 0) return null;
  if (typeof canvasType !== 'string' || canvasType.length === 0) return null;
  // An array would satisfy `typeof === 'object'` and then spread into the
  // canvas config as numeric keys.
  if (typeof initialProps !== 'object' || initialProps === null || Array.isArray(initialProps)) {
    return null;
  }
  return {
    type: 'RENDER_REQUEST',
    requestId,
    canvasType,
    initialProps: initialProps as Record<string, unknown>,
  };
}
