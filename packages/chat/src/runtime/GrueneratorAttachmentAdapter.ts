import type {
  AttachmentAdapter,
  PendingAttachment,
  CompleteAttachment,
  Attachment,
} from '@assistant-ui/react';
import {
  validateFile,
  isImageMimeType,
  fileToBase64,
  getAcceptedFileTypes,
} from '../lib/fileUtils';

export class GrueneratorAttachmentAdapter implements AttachmentAdapter {
  accept = getAcceptedFileTypes();

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    validateFile(file);

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
