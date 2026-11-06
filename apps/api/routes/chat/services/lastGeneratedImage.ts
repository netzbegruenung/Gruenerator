/**
 * Das zuletzt im Thread erzeugte Bild als Bearbeitungs-Eingabe („mach es
 * blauer" nach einem Generierungs-Turn). Drei Leser: der Router für das
 * Einzeldurchlauf-`image_edit`, das Loop-Werkzeug `edit_image` und die Fotos
 * eines Sharepic-Turns (`photosForTurn`) — eine Quelle, damit alle dasselbe
 * Bild meinen.
 *
 * Nur lokale FLUX-Ergebnisse (strikte Pfadform, kein Traversal).
 */
import { promises as fsPromises } from 'node:fs';
import nodePath from 'node:path';

import { createLogger } from '../../../utils/logger.js';

import { getLastGeneratedImageUrl } from './threadPersistenceService.js';

import type { ImageAttachment } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('lastGeneratedImage');

export async function loadLastGeneratedImage(threadId: string): Promise<ImageAttachment | null> {
  const lastUrl = await getLastGeneratedImageUrl(threadId).catch(() => null);
  const m = lastUrl?.match(/^\/uploads\/(flux\/results\/[\w.-]+\/[\w.-]+)$/);
  if (!m?.[1]) return null;
  try {
    const filePath = nodePath.join(process.cwd(), 'uploads', m[1]);
    const data = await fsPromises.readFile(filePath);
    return { name: nodePath.basename(filePath), type: 'image/jpeg', data: data.toString('base64') };
  } catch (err) {
    log.warn(
      `Could not rehydrate previous image (${err instanceof Error ? err.message : String(err)})`
    );
    return null;
  }
}
