import type {
  AttachmentAdapter,
  PendingAttachment,
  CompleteAttachment,
  Attachment,
} from '@assistant-ui/core';
import {
  validateFile,
  isImageMimeType,
  fileToBase64,
  getAcceptedFileTypes,
} from '../lib/fileUtils';
import { handleAttachmentError } from '../lib/attachmentErrorHandler';

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
];

export class GrueneratorAttachmentAdapter implements AttachmentAdapter {
  accept = [getAcceptedFileTypes(), ...SYNTHETIC_MENTION_TYPES].join(',');

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    try {
      validateFile(file);
    } catch (error) {
      handleAttachmentError(error);
      throw error;
    }

    return {
      id: crypto.randomUUID(),
      type: isImageMimeType(file.type) ? 'image' : 'document',
      name: file.name,
      contentType: file.type,
      file,
      status: { type: 'requires-action', reason: 'composer-send' },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const base64 = await fileToBase64(attachment.file);
    const mimeType = attachment.contentType ?? 'application/octet-stream';
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

  async remove(_attachment: Attachment): Promise<void> {}
}
