/**
 * Shared local-disk storage config for board card attachments. Files live on the
 * persistent `api-uploads` volume (apps/api/uploads/board-attachments), named by a
 * random UUID; the DB row keeps the original file name + stored filename.
 */
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { createLogger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('board-attachments');

export const ATTACHMENT_DIR = path.join(__dirname, '../../uploads/board-attachments');
export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB

export { isSafeToInline, lookupMime } from '../../utils/fileAttachments.js';

void (async () => {
  try {
    await fs.promises.mkdir(ATTACHMENT_DIR, { recursive: true });
  } catch (err: unknown) {
    log.error(
      `Failed to create board attachment directory: ${err instanceof Error ? err.message : String(err)}`
    );
  }
})();

/** Delete a stored file by its (untrusted) filename, guarding against traversal. */
export async function deleteStoredFile(storedFilename: string): Promise<void> {
  const safe = path.basename(storedFilename);
  try {
    await fs.promises.unlink(path.join(ATTACHMENT_DIR, safe));
  } catch {
    // Already gone — ignore.
  }
}
