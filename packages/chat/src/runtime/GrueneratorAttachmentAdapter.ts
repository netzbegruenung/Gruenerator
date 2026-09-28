import {
  ATTACHMENT_META_PART_NAME,
  getPdfPageCount,
  type AttachmentMetaData,
} from '../lib/attachmentMeta';
import {
  validateFile,
  isImageMimeType,
  isVideoMimeType,
  fileToBase64,
  getAcceptedFileTypes,
} from '../lib/fileUtils';
import { isTabularFile } from '../lib/spreadsheetSetup';
import { useAttachmentNoticeStore } from '../stores/attachmentNoticeStore';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { usePythonFileStore } from '../stores/pythonFileStore';

import type {
  AttachmentAdapter,
  PendingAttachment,
  CompleteAttachment,
  Attachment,
} from '@assistant-ui/core';

// Synthetic content types used by @docs / @datei mention chips. These never
// correspond to real File uploads — they flow through AUI's CreateAttachment
// branch — but AUI's addAttachment still validates contentType against the
// adapter's accept list, so they must appear here.
const SYNTHETIC_MENTION_TYPES = [
  'application/x-gruenerator-collab-doc',
  'application/x-gruenerator-datei-notebook',
  'application/x-gruenerator-datei-document',
  'application/x-gruenerator-datei-text',
  'application/x-gruenerator-wolke',
  'application/x-gruenerator-connect',
  'application/x-gruenerator-webpage',
];

/** Name of the data content part carrying a chat video's TUS upload result. */
export const REEL_UPLOAD_PART_NAME = 'gruenerator-reel-upload';

export interface ReelUploadData {
  uploadId: string;
  filename: string;
}

export class GrueneratorAttachmentAdapter implements AttachmentAdapter {
  accept = [getAcceptedFileTypes(), ...SYNTHETIC_MENTION_TYPES].join(',');

  /**
   * TUS uploads started in add(), awaited in send(). Keyed by attachment id
   * so the upload runs while the user is still composing the message.
   */
  private reelUploads = new Map<
    string,
    { promise: Promise<{ uploadId: string }>; abort: () => void }
  >();

  /**
   * File contents read in add(), consumed in send(). A picked File is a
   * snapshot: once the file changes on disk (saved again, OneDrive sync) every
   * later read fails with NotReadableError. Reading at pick time captures the
   * bytes while they are valid, and a read error surfaces through AUI's
   * attachmentAddError instead of an unhandled rejection at send time.
   */
  private readContents = new Map<string, { base64: string; pageCount: number | null }>();

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    // Let validation errors propagate. AUI catches them and emits a structured
    // `attachmentAddError` (reason: 'adapter-error') carrying this message —
    // handleAttachmentAddError surfaces it as the user-facing notice. Catching
    // here too would set a notice that the event handler then overwrites.
    validateFile(file);

    const id = crypto.randomUUID();

    if (isVideoMimeType(file.type)) {
      const { uploadReelVideo } = useChatConfigStore.getState();
      if (!uploadReelVideo) {
        throw new Error('Video-Upload ist auf dieser Oberfläche nicht verfügbar.');
      }
      // The request body carries exactly one reelUpload — a second video
      // would silently win over the first, so reject it up front.
      if (this.reelUploads.size > 0) {
        throw new Error('Bitte nur ein Video pro Nachricht anhängen.');
      }
      // Start the upload immediately; send() awaits the result. A failed
      // upload surfaces when the user sends (attachment errors out there).
      // The no-op catch marks the promise handled so an upload that fails
      // after the attachment was removed (or never sent) doesn't fire an
      // unhandled promise rejection.
      const upload = uploadReelVideo(file);
      upload.promise.catch(() => {});
      this.reelUploads.set(id, upload);

      return {
        id,
        type: 'file',
        name: file.name,
        contentType: file.type,
        file,
        status: { type: 'requires-action', reason: 'composer-send' },
      };
    }

    const [base64, pageCount] = await Promise.all([fileToBase64(file), getPdfPageCount(file)]);
    this.readContents.set(id, { base64, pageCount });

    return {
      id,
      type: isImageMimeType(file.type) ? 'image' : 'document',
      name: file.name,
      contentType: file.type,
      file,
      status: { type: 'requires-action', reason: 'composer-send' },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    try {
      return await this.complete(attachment);
    } catch (error) {
      // AUI has no event for send-time attachment failures: it restores the
      // draft and rethrows into an unawaited send(), so without this notice
      // the user sees the text bounce back into the composer and nothing else.
      useAttachmentNoticeStore.getState().setNotice({
        title: 'Nachricht nicht gesendet',
        description:
          error instanceof Error
            ? error.message
            : `Der Anhang „${attachment.name}" konnte nicht verarbeitet werden.`,
      });
      throw error;
    }
  }

  private async complete(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const mimeType = attachment.contentType ?? 'application/octet-stream';

    const reelUpload = this.reelUploads.get(attachment.id);
    if (reelUpload) {
      try {
        const { uploadId } = await reelUpload.promise;
        const data: ReelUploadData = { uploadId, filename: attachment.name };
        return {
          id: attachment.id,
          type: attachment.type,
          name: attachment.name,
          contentType: mimeType,
          // Synthetic data part (same mechanism as mention chips) — the model
          // adapter extracts it into the request body's `reelUpload` field.
          // No file/image part, so nothing gets base64'd.
          content: [{ type: 'data' as const, name: REEL_UPLOAD_PART_NAME, data }],
          status: { type: 'complete' },
        };
      } finally {
        this.reelUploads.delete(attachment.id);
      }
    }

    const { base64, pageCount } = this.readContents.get(attachment.id) ?? {
      base64: await fileToBase64(attachment.file),
      pageCount: await getPdfPageCount(attachment.file),
    };
    this.readContents.delete(attachment.id);

    // Bridge tabular files into the in-browser interpreter: keep the raw bytes
    // in a session store so the Python Run button can pass them to the Pyodide
    // worker (the base64 part below still goes to the model, so it knows the
    // file name/columns). Zero-cost for non-tabular attachments.
    if (isTabularFile(attachment.name, mimeType)) {
      usePythonFileStore.getState().setFile({
        name: attachment.name,
        mimeType,
        bytes: base64ToArrayBuffer(base64),
      });
    }

    const isImage = isImageMimeType(mimeType);

    // Display metadata for the attachment chip in the sent message. Data parts
    // are ignored by the model adapter, so this stays client-side only.
    const meta: AttachmentMetaData = { size: attachment.file.size };
    if (pageCount != null) meta.pageCount = pageCount;
    const metaPart = { type: 'data' as const, name: ATTACHMENT_META_PART_NAME, data: meta };

    return {
      id: attachment.id,
      type: attachment.type,
      name: attachment.name,
      contentType: mimeType,
      content: isImage
        ? [{ type: 'image' as const, image: `data:${mimeType};base64,${base64}` }, metaPart]
        : [{ type: 'file' as const, data: base64, mimeType }, metaPart],
      status: { type: 'complete' },
    };
  }

  async remove(attachment: Attachment): Promise<void> {
    // Abort an in-flight video upload — without this a removed 500MB
    // attachment keeps saturating the upstream and orphans a server file.
    this.reelUploads.get(attachment.id)?.abort();
    this.reelUploads.delete(attachment.id);
    this.readContents.delete(attachment.id);
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
