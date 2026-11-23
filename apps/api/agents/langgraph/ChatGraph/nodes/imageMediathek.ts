import { getSharedMediaService } from '../../../../services/sharedMediaService.js';
import { createLogger } from '../../../../utils/logger.js';

import type { DownloadResult } from '../../../../services/flux/FluxImageService.js';

const log = createLogger('ImageMediathek');

/**
 * Files a chat-generated image as a Mediathek row (`upload_source = ai_generated`
 * → `content_origin = 'ki'`), so creation in the chat shows up under „KI-Bilder“
 * in the Studio. Best effort: a failed write must not cost the person the image
 * they just paid for, so it logs and returns null instead of throwing.
 */
export async function saveGeneratedImageToMediathek(
  userId: string,
  stored: Pick<DownloadResult, 'base64' | 'filename'>,
  title: string
): Promise<string | null> {
  try {
    const share = await getSharedMediaService().uploadMediaFile(userId, {
      fileBuffer: Buffer.from(stored.base64, 'base64'),
      originalFilename: stored.filename,
      mimeType: 'image/jpeg',
      title: title.slice(0, 120),
      altText: title.slice(0, 300),
      uploadSource: 'ai_generated',
    });
    return share.shareToken;
  } catch (error) {
    log.warn(`mediathek write failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
