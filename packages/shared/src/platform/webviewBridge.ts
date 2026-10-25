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
 * The small messages are checked by hand. The creator messages carry a whole
 * sharepic spec, so those fields go through the contracts' own zod schemas —
 * a hand-written check of that shape would drift from the one the server uses.
 *
 * What the parser must keep either way is the property the tests pin:
 * every branch RECONSTRUCTS its message instead of passing the candidate
 * through, and unknown fields are dropped rather than rejected — an older app
 * binary has to keep understanding a newer page.
 */

import {
  sharepicPatchOpSchema,
  sharepicPhotoAttributionSchema,
  type SharepicPatchOp,
  type SharepicPhotoAttribution,
  type SharepicSpec,
  sharepicSpecSchema,
} from '@gruenerator/contracts';
import { z } from 'zod';

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

/**
 * What a render page can do beyond plain renders, announced in
 * `RENDER_HOST_READY`. Additive on purpose: a new message must not bump
 * `WEBVIEW_PROTOCOL_VERSION`, which shipped binaries compare strictly — an old
 * page simply announces nothing, and the host leaves the feature off.
 */
export const RENDER_CAPABILITY_CREATOR = 'creator';

/**
 * Where a host announces what it can do for an embedded page. The host sets it
 * before the page's scripts run; a page must only send a message that needs a
 * capability when the capability is listed — an older binary sets nothing and
 * would silently drop the message.
 */
export const HOST_CAPABILITIES_GLOBAL = '__GRUENERATOR_HOST_CAPS__';

/** The host opens the native share sheet for a `SHARE_FILE`. */
export const HOST_CAPABILITY_SHARE = 'share';

/**
 * The host sends `REQUEST_CLOSE` on Android's hardware back instead of popping
 * the screen, once the page has announced `CLOSE_HANDLER`.
 */
export const HOST_CAPABILITY_REQUEST_CLOSE = 'requestClose';

/**
 * The host draws the editor's top bar natively (close, title, undo/redo,
 * share, and a "…" menu of the page's other actions), so the page hides its own
 * and reports `EDITOR_STATE` instead. The host answers with `EDITOR_COMMAND`,
 * `EDITOR_RENAME` and `EDITOR_ACTION`. One page-side implementation:
 * `useNativeEditorBar` in `apps/web/src/hooks`.
 */
export const HOST_CAPABILITY_EDITOR_CHROME = 'editorChrome';

/** What the host's native editor bar can ask the page to do. */
export type EditorCommand = 'undo' | 'redo' | 'share';
const EDITOR_COMMANDS: readonly EditorCommand[] = ['undo', 'redo', 'share'];

/** Longest title the host may send in `EDITOR_RENAME`; matches the rename sheet. */
export const EDITOR_TITLE_MAX_LENGTH = 120;

/**
 * One entry of the host's "…" menu, listed in `EDITOR_STATE.actions`. The host
 * answers a tap with `EDITOR_ACTION` and the id; what the entry does stays in
 * the page.
 */
export interface EditorMenuAction {
  id: string;
  label: string;
  /** Red on iOS, and the entry that needs a second thought; the page still confirms. */
  destructive?: boolean;
  /** A switch that is on: shown with a checkmark. */
  checked?: boolean;
}

/** More entries than this do not fit a phone's menu; the rest are dropped. */
export const EDITOR_MENU_MAX_ACTIONS = 16;
const EDITOR_ACTION_ID_MAX_LENGTH = 64;
const EDITOR_ACTION_LABEL_MAX_LENGTH = 80;

/** Keeps the well-formed entries and drops the rest, as for unknown fields. */
function parseEditorMenuActions(raw: unknown): EditorMenuAction[] | null {
  if (!Array.isArray(raw)) return null;
  const actions: EditorMenuAction[] = [];
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const id = (entry as { id?: unknown }).id;
    const label = (entry as { label?: unknown }).label;
    if (typeof id !== 'string' || id.length === 0 || id.length > EDITOR_ACTION_ID_MAX_LENGTH) {
      continue;
    }
    if (typeof label !== 'string' || label.length === 0) continue;
    if (label.length > EDITOR_ACTION_LABEL_MAX_LENGTH) continue;
    const destructive = (entry as { destructive?: unknown }).destructive === true;
    const checked = (entry as { checked?: unknown }).checked === true;
    actions.push({ id, label, ...(destructive && { destructive }), ...(checked && { checked }) });
    if (actions.length === EDITOR_MENU_MAX_ACTIONS) break;
  }
  return actions;
}

/** The script a host injects to announce `capabilities`; ends in `true` as WebView injection expects. */
export function hostCapabilitiesScript(capabilities: readonly string[]): string {
  return `window.${HOST_CAPABILITIES_GLOBAL} = ${JSON.stringify(capabilities)}; true;`;
}

/** One design variation of a creator draft as it crosses the bridge. */
export const creatorTweakWireSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string().nullable(),
  options: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
      short: z.string(),
      disabled: z.boolean(),
      swatch: z.array(z.string()).nullable(),
    })
  ),
});
export type CreatorTweakWire = z.infer<typeof creatorTweakWireSchema>;

const creatorAttributionsSchema = z.array(sharepicPhotoAttributionSchema.nullable());
const creatorPatchSchema = z.array(sharepicPatchOpSchema).nullable();
const creatorChoiceSchema = z.record(z.string(), z.string());
const creatorTweaksSchema = z.array(creatorTweakWireSchema);

/** A rendered image on the string channel: a data URL under the download ceiling. */
const isImageDataUrl = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.startsWith('data:image/') &&
  value.length <= WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH;

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
       * A file the user wants to share rather than save. Same payload and cap
       * as `DOWNLOAD_FILE`; the host always opens the share sheet. Only sent
       * when the host announced `HOST_CAPABILITY_SHARE`.
       */
      type: 'SHARE_FILE';
      filename: string;
      mime: string;
      data: string;
      title?: string;
      text?: string;
    }
  | {
      /**
       * Present mode opened (`true`) or closed (`false`). A phone app is
       * portrait-only, which letterboxes a 16:9 deck to a quarter of the screen;
       * while this is `true` the host lets the screen rotate and gives up its
       * status-bar band. Fullscreen cannot come from the page: WKWebView honours
       * the Fullscreen API for `<video>` only.
       */
      type: 'PRESENTING';
      active: boolean;
    }
  | {
      /**
       * The page has unsaved state to flush before it may be torn down
       * (`true`), or no longer has (`false`). While `true` the host answers
       * hardware back with `REQUEST_CLOSE` and waits for `CLOSE`. Only sent
       * when the host announced `HOST_CAPABILITY_REQUEST_CLOSE`.
       */
      type: 'CLOSE_HANDLER';
      active: boolean;
    }
  | {
      /**
       * What the host's native editor bar shows. Sent whenever any field
       * changes; only when the host announced `HOST_CAPABILITY_EDITOR_CHROME`.
       */
      type: 'EDITOR_STATE';
      title: string;
      /** False for a read-only viewer: no rename, no undo/redo. */
      canEdit: boolean;
      canUndo: boolean;
      canRedo: boolean;
      /**
       * False when the page has no undo/redo at all (a board), so the host
       * leaves the buttons out instead of greying them. Absent means true: the
       * canvas editor, which sent no such field, has both.
       */
      history?: boolean;
      /** Whether the share button works here. Absent means true, for the same reason. */
      canShare?: boolean;
      /** The page's further actions, for the host's "…" menu. Absent or empty: no menu. */
      actions?: EditorMenuAction[];
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
      /** See `RENDER_CAPABILITY_CREATOR`. The parser fills `[]` for an older page. */
      capabilities?: string[];
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
    }
  | {
      /**
       * A creator sharepic composed into editor pages, answering one
       * `COMPOSE_REQUEST`. Failures come back as `RENDER_ERROR`.
       */
      type: 'COMPOSE_RESULT';
      requestId: string;
      canvasType: string;
      initialProps: Record<string, unknown>;
      format?: string;
      /** Canvas title derived from the creator spec. */
      title?: string;
    }
  | {
      /**
       * One creator turn rendered, answering one `CREATOR_RENDER_REQUEST`.
       * `base` is the draft with the review patch applied, `spec` that draft
       * with the design choices. Failures come back as `RENDER_ERROR`.
       */
      type: 'CREATOR_RENDER_RESULT';
      requestId: string;
      base: SharepicSpec;
      spec: SharepicSpec;
      tweaks: CreatorTweakWire[];
      /** Every slide in order, as data URLs. */
      images: string[];
      /** The review's contact sheet; null unless the request asked for one. */
      sheet: string | null;
    };

export type WebViewOutboundMessageType = WebViewOutboundMessage['type'];

/** Sent by the native host into the embedded page. */
export type WebViewInboundMessage =
  | WebViewRenderRequest
  | {
      /**
       * Compose creator props into the pages the editor opens, so the server
       * can mint a canvas from them. Only the browser can compose.
       */
      type: 'COMPOSE_REQUEST';
      requestId: string;
      canvasType: string;
      initialProps: Record<string, unknown>;
    }
  | {
      /**
       * Run one turn of the free-text creator's rendering: apply the review
       * patch to `base`, the design `choice` to the result, compose, render
       * every slide and, with `sheet`, build the review's contact sheet.
       */
      type: 'CREATOR_RENDER_REQUEST';
      requestId: string;
      base: SharepicSpec;
      attributions: (SharepicPhotoAttribution | null)[];
      patch: SharepicPatchOp[] | null;
      choice: Record<string, string>;
      sheet: boolean;
    }
  | {
      /**
       * The user pressed hardware back. The page flushes what it announced in
       * `CLOSE_HANDLER` and answers with `CLOSE`.
       */
      type: 'REQUEST_CLOSE';
    }
  | {
      /** A button in the host's native editor bar; see `HOST_CAPABILITY_EDITOR_CHROME`. */
      type: 'EDITOR_COMMAND';
      command: EditorCommand;
    }
  | {
      /** The user renamed the document in the host's native editor bar. */
      type: 'EDITOR_RENAME';
      title: string;
    }
  | {
      /** The user picked an entry of the host's "…" menu; `id` is one from `EDITOR_STATE.actions`. */
      type: 'EDITOR_ACTION';
      id: string;
    };

type WebViewRenderRequest = {
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

/** True when the native host announced `capability`; see `HOST_CAPABILITIES_GLOBAL`. */
export function hostSupports(capability: string): boolean {
  if (nativeHost() === null) return false;
  const announced = (window as unknown as Record<string, unknown>)[HOST_CAPABILITIES_GLOBAL];
  return Array.isArray(announced) && announced.includes(capability);
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
  if (type === 'DOWNLOAD_FILE' || type === 'SHARE_FILE') {
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
    if (type === 'DOWNLOAD_FILE') return { type: 'DOWNLOAD_FILE', filename, mime, data };
    const title = (candidate as { title?: unknown }).title;
    const text = (candidate as { text?: unknown }).text;
    return {
      type: 'SHARE_FILE',
      filename,
      mime,
      data,
      ...(typeof title === 'string' && { title }),
      ...(typeof text === 'string' && { text }),
    };
  }
  if (type === 'PRESENTING' || type === 'CLOSE_HANDLER') {
    const active = (candidate as { active?: unknown }).active;
    if (typeof active !== 'boolean') return null;
    return { type, active };
  }
  if (type === 'EDITOR_STATE') {
    const title = (candidate as { title?: unknown }).title;
    const canEdit = (candidate as { canEdit?: unknown }).canEdit;
    const canUndo = (candidate as { canUndo?: unknown }).canUndo;
    const canRedo = (candidate as { canRedo?: unknown }).canRedo;
    if (typeof title !== 'string') return null;
    if (typeof canEdit !== 'boolean' || typeof canUndo !== 'boolean') return null;
    if (typeof canRedo !== 'boolean') return null;
    const history = (candidate as { history?: unknown }).history;
    const canShare = (candidate as { canShare?: unknown }).canShare;
    const actions = parseEditorMenuActions((candidate as { actions?: unknown }).actions);
    return {
      type: 'EDITOR_STATE',
      title,
      canEdit,
      canUndo,
      canRedo,
      ...(typeof history === 'boolean' && { history }),
      ...(typeof canShare === 'boolean' && { canShare }),
      ...(actions !== null && { actions }),
    };
  }
  if (type === 'RENDER_HOST_READY') {
    const protocolVersion = (candidate as { protocolVersion?: unknown }).protocolVersion;
    if (typeof protocolVersion !== 'number' || !Number.isFinite(protocolVersion)) return null;
    const announced = (candidate as { capabilities?: unknown }).capabilities;
    const capabilities =
      Array.isArray(announced) && announced.every((c) => typeof c === 'string')
        ? [...(announced as string[])]
        : [];
    return { type: 'RENDER_HOST_READY', protocolVersion, capabilities };
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
  if (type === 'COMPOSE_RESULT') {
    const requestId = (candidate as { requestId?: unknown }).requestId;
    const canvasType = (candidate as { canvasType?: unknown }).canvasType;
    const initialProps = (candidate as { initialProps?: unknown }).initialProps;
    const format = (candidate as { format?: unknown }).format;
    if (typeof requestId !== 'string' || requestId.length === 0) return null;
    if (typeof canvasType !== 'string' || canvasType.length === 0) return null;
    if (typeof initialProps !== 'object' || initialProps === null || Array.isArray(initialProps)) {
      return null;
    }
    const title = (candidate as { title?: unknown }).title;
    return {
      type: 'COMPOSE_RESULT',
      requestId,
      canvasType,
      initialProps: initialProps as Record<string, unknown>,
      ...(typeof format === 'string' && { format }),
      ...(typeof title === 'string' && { title }),
    };
  }
  if (type === 'CREATOR_RENDER_RESULT') {
    const requestId = (candidate as { requestId?: unknown }).requestId;
    const images = (candidate as { images?: unknown }).images;
    const sheet = (candidate as { sheet?: unknown }).sheet;
    if (typeof requestId !== 'string' || requestId.length === 0) return null;
    if (!Array.isArray(images) || images.length === 0 || !images.every(isImageDataUrl)) {
      return null;
    }
    if (sheet !== null && !isImageDataUrl(sheet)) return null;
    const base = sharepicSpecSchema.safeParse((candidate as { base?: unknown }).base);
    const spec = sharepicSpecSchema.safeParse((candidate as { spec?: unknown }).spec);
    const tweaks = creatorTweaksSchema.safeParse((candidate as { tweaks?: unknown }).tweaks);
    if (!base.success || !spec.success || !tweaks.success) return null;
    return {
      type: 'CREATOR_RENDER_RESULT',
      requestId,
      base: base.data,
      spec: spec.data,
      tweaks: tweaks.data,
      images: [...(images as string[])],
      sheet,
    };
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
  const type = (candidate as { type?: unknown }).type;
  if (type === 'REQUEST_CLOSE') return { type: 'REQUEST_CLOSE' };
  if (type === 'EDITOR_COMMAND') {
    const command = (candidate as { command?: unknown }).command;
    const known = EDITOR_COMMANDS.find((c) => c === command);
    return known ? { type: 'EDITOR_COMMAND', command: known } : null;
  }
  if (type === 'EDITOR_RENAME') {
    const title = (candidate as { title?: unknown }).title;
    if (typeof title !== 'string') return null;
    const trimmed = title.trim();
    if (trimmed.length === 0 || trimmed.length > EDITOR_TITLE_MAX_LENGTH) return null;
    return { type: 'EDITOR_RENAME', title: trimmed };
  }
  if (type === 'EDITOR_ACTION') {
    const id = (candidate as { id?: unknown }).id;
    if (typeof id !== 'string' || id.length === 0 || id.length > EDITOR_ACTION_ID_MAX_LENGTH) {
      return null;
    }
    return { type: 'EDITOR_ACTION', id };
  }
  if (type === 'CREATOR_RENDER_REQUEST') {
    const requestId = (candidate as { requestId?: unknown }).requestId;
    const sheet = (candidate as { sheet?: unknown }).sheet;
    if (typeof requestId !== 'string' || requestId.length === 0) return null;
    if (typeof sheet !== 'boolean') return null;
    const base = sharepicSpecSchema.safeParse((candidate as { base?: unknown }).base);
    const attributions = creatorAttributionsSchema.safeParse(
      (candidate as { attributions?: unknown }).attributions
    );
    const patch = creatorPatchSchema.safeParse((candidate as { patch?: unknown }).patch);
    const choice = creatorChoiceSchema.safeParse((candidate as { choice?: unknown }).choice);
    if (!base.success || !attributions.success || !patch.success || !choice.success) return null;
    return {
      type: 'CREATOR_RENDER_REQUEST',
      requestId,
      base: base.data,
      attributions: attributions.data,
      patch: patch.data,
      choice: choice.data,
      sheet,
    };
  }
  if (type !== 'RENDER_REQUEST' && type !== 'COMPOSE_REQUEST') return null;
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
  const props = initialProps as Record<string, unknown>;
  if (type === 'COMPOSE_REQUEST') {
    return { type: 'COMPOSE_REQUEST', requestId, canvasType, initialProps: props };
  }
  return { type: 'RENDER_REQUEST', requestId, canvasType, initialProps: props };
}
