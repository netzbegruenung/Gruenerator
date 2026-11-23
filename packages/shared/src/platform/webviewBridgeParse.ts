/**
 * Parsers for the WebView bridge messages (see `webviewBridge.ts`). Split off
 * so the creator messages' zod schemas load only where a message is parsed,
 * not with the bridge's constants and helpers in the web entry (#5891).
 */
import {
  sharepicPatchOpSchema,
  sharepicPhotoAttributionSchema,
  sharepicSpecSchema,
} from '@gruenerator/contracts';
import { z } from 'zod';

import {
  EDITOR_MENU_MAX_ACTIONS,
  EDITOR_TITLE_MAX_LENGTH,
  type EditorCommand,
  type EditorMenuAction,
  FILE_TRANSFER_CHUNK_MAX_BASE64_LENGTH,
  FILE_TRANSFER_MAX_BYTES,
  isSafeDownloadFilename,
  WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH,
  type WebViewInboundMessage,
  type WebViewOutboundMessage,
} from './webviewBridge.js';

const FILE_TRANSFER_ID_MAX_LENGTH = 64;

const isTransferId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= FILE_TRANSFER_ID_MAX_LENGTH;

const isChunkIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const EDITOR_COMMANDS: readonly EditorCommand[] = ['undo', 'redo', 'share'];

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
  if (type === 'FILE_TRANSFER_BEGIN') {
    const transferId = (candidate as { transferId?: unknown }).transferId;
    const filename = (candidate as { filename?: unknown }).filename;
    const mime = (candidate as { mime?: unknown }).mime;
    const size = (candidate as { size?: unknown }).size;
    if (!isTransferId(transferId)) return null;
    if (typeof filename !== 'string' || !isSafeDownloadFilename(filename)) return null;
    if (typeof mime !== 'string' || mime.length === 0) return null;
    if (!isChunkIndex(size) || size === 0 || size > FILE_TRANSFER_MAX_BYTES) return null;
    return { type: 'FILE_TRANSFER_BEGIN', transferId, filename, mime, size };
  }
  if (type === 'FILE_TRANSFER_CHUNK') {
    const transferId = (candidate as { transferId?: unknown }).transferId;
    const index = (candidate as { index?: unknown }).index;
    const data = (candidate as { data?: unknown }).data;
    if (!isTransferId(transferId) || !isChunkIndex(index)) return null;
    if (typeof data !== 'string' || data.length === 0) return null;
    if (data.length > FILE_TRANSFER_CHUNK_MAX_BASE64_LENGTH) return null;
    return { type: 'FILE_TRANSFER_CHUNK', transferId, index, data };
  }
  if (type === 'FILE_TRANSFER_END' || type === 'FILE_TRANSFER_ABORT') {
    const transferId = (candidate as { transferId?: unknown }).transferId;
    if (!isTransferId(transferId)) return null;
    return { type, transferId };
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
  if (type === 'FILE_TRANSFER_ACK') {
    const transferId = (candidate as { transferId?: unknown }).transferId;
    const received = (candidate as { received?: unknown }).received;
    if (!isTransferId(transferId) || !isChunkIndex(received)) return null;
    return { type: 'FILE_TRANSFER_ACK', transferId, received };
  }
  if (type === 'FILE_TRANSFER_FAILED') {
    const transferId = (candidate as { transferId?: unknown }).transferId;
    const reason = (candidate as { reason?: unknown }).reason;
    if (!isTransferId(transferId) || typeof reason !== 'string') return null;
    return { type: 'FILE_TRANSFER_FAILED', transferId, reason };
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
