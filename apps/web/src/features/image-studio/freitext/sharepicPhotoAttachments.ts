import {
  type AttachmentAdapter,
  type CompleteAttachment,
  type PendingAttachment,
} from '@assistant-ui/react';

import { type CreatorPhoto, PHOTO_ACCEPT, photoFileProblem, preparePhoto } from './sharepicPhotos';

/** Name of the data part that carries a prepared photo from the adapter to `onNew`. */
export const PHOTO_PART_NAME = 'sharepic-photo';

/** Outcome of one attachment: the prepared photo, or why it is not usable. */
export type PhotoOutcome = { photo: CreatorPhoto } | { error: string };

/**
 * Attachment adapter of the creator chat. A picked file is uploaded to the
 * media library and described by vision while the person is still typing; send
 * only waits for that. `send` never throws — a failed photo travels as an
 * `error` outcome, so the chat can say so instead of silently bouncing the draft.
 */
export class SharepicPhotoAttachmentAdapter implements AttachmentAdapter {
  accept = PHOTO_ACCEPT;

  private jobs = new Map<string, Promise<CreatorPhoto>>();

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    const problem = photoFileProblem(file);
    if (problem) throw new Error(problem);
    const id = crypto.randomUUID();
    const job = preparePhoto(file);
    // Handled here so a photo removed before send cannot become an unhandled rejection.
    job.catch(() => {});
    this.jobs.set(id, job);
    return {
      id,
      type: 'image',
      name: file.name,
      contentType: file.type,
      file,
      status: { type: 'requires-action', reason: 'composer-send' },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const job = this.jobs.get(attachment.id);
    this.jobs.delete(attachment.id);
    let outcome: PhotoOutcome;
    try {
      if (!job) throw new Error(`„${attachment.name}“ konnte nicht verarbeitet werden.`);
      outcome = { photo: await job };
    } catch (err) {
      outcome = {
        error:
          err instanceof Error
            ? err.message
            : `„${attachment.name}“ konnte nicht verarbeitet werden.`,
      };
    }
    return {
      id: attachment.id,
      type: attachment.type,
      name: attachment.name,
      contentType: attachment.contentType ?? 'image/jpeg',
      content: [{ type: 'data', name: PHOTO_PART_NAME, data: outcome }],
      status: { type: 'complete' },
    };
  }

  async remove(attachment: { id: string }): Promise<void> {
    this.jobs.delete(attachment.id);
  }
}

/** The photos (and failures) a sent message carries. */
export function photosOf(
  attachments: readonly { content?: readonly { type: string; name?: string; data?: unknown }[] }[]
): { photos: CreatorPhoto[]; errors: string[] } {
  const photos: CreatorPhoto[] = [];
  const errors: string[] = [];
  for (const attachment of attachments) {
    for (const part of attachment.content ?? []) {
      if (part.type !== 'data' || part.name !== PHOTO_PART_NAME) continue;
      const outcome = part.data as PhotoOutcome;
      if ('photo' in outcome) photos.push(outcome.photo);
      else errors.push(outcome.error);
    }
  }
  return { photos, errors };
}
