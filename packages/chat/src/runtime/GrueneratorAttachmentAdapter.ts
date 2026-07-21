import type {
  AttachmentAdapter,
  PendingAttachment,
  CompleteAttachment,
  Attachment,
} from '@assistant-ui/core';
import {
  validateFile,
  isImageMimeType,
  isVideoMimeType,
  fileToBase64,
  getAcceptedFileTypes,
} from '../lib/fileUtils';
import { isTabularFile } from '../lib/spreadsheetSetup';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { usePythonFileStore } from '../stores/pythonFileStore';

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

    // Bridge tabular files into the in-browser interpreter: keep the raw bytes
    // in a session store so the Python Run button can pass them to the Pyodide
    // worker (the base64 part below still goes to the model, so it knows the
    // file name/columns). Zero-cost for non-tabular attachments.
    if (isTabularFile(attachment.name, mimeType)) {
      usePythonFileStore.getState().setFile({
        name: attachment.name,
        mimeType,
        bytes: await attachment.file.arrayBuffer(),
      });
    }

    const base64 = await fileToBase64(attachment.file);
    const isImage = isImageMimeType(mimeType);

    return {
      id: attachment.id,
      type: attachment.type,
      name: attachment.name,
      contentType: mimeType,
      content: isImage
        ? [{ type: 'image' as const, image: `data:${mimeType};base64,${base64}` }]
        : [{ type: 'file' as const, data: base64, mimeType }],
      status: { type: 'complete' },
    };
  }

  async remove(attachment: Attachment): Promise<void> {
    // Abort an in-flight video upload — without this a removed 500MB
    // attachment keeps saturating the upstream and orphans a server file.
    this.reelUploads.get(attachment.id)?.abort();
    this.reelUploads.delete(attachment.id);
  }
}
