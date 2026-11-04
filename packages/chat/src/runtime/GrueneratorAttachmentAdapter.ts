import {
  ATTACHMENT_META_PART_NAME,
  getPdfPageCount,
  type AttachmentMetaData,
} from '../lib/attachmentMeta';
import { NOTEBOOK_SOURCE_CONTENT_TYPE } from '../lib/documentMentionables';
import {
  validateFile,
  isImageMimeType,
  fileToBase64,
  getAcceptedFileTypes,
} from '../lib/fileUtils';
import { isTabularFile } from '../lib/spreadsheetSetup';
import { useAttachmentNoticeStore } from '../stores/attachmentNoticeStore';
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
  NOTEBOOK_SOURCE_CONTENT_TYPE,
];

export class GrueneratorAttachmentAdapter implements AttachmentAdapter {
  accept = [getAcceptedFileTypes(), ...SYNTHETIC_MENTION_TYPES].join(',');

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
    this.readContents.delete(attachment.id);
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
