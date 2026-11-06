/**
 * Lädt die Bilder aus `listTurnImageRefs`: Anhänge liegen schon als Base64 vor,
 * Wolke-Fotos werden beim ersten Gebrauch heruntergeladen und für den Rest des
 * Zuges gemerkt — zwei Werkzeugaufrufe laden dieselbe Datei nicht zweimal.
 */
import { downloadWolkeFile } from '../../../agents/langgraph/ChatGraph/nodes/wolkeRetrieval.js';
import {
  type ChatGraphState,
  type ImageAttachment,
} from '../../../agents/langgraph/ChatGraph/types.js';
import { MAX_BYTES } from '../../../services/sharepicCreator/photoAnalysis.js';
import { createLogger } from '../../../utils/logger.js';

import { listTurnImageRefs } from './turnImageList.js';

const log = createLogger('turnImages');

export type TurnImageLoad = { ok: true; image: ImageAttachment } | { ok: false; message: string };

export interface TurnImage {
  name: string;
  fromWolke: boolean;
  load: () => Promise<TurnImageLoad>;
}

type Download = (
  userId: string,
  ref: Parameters<typeof downloadWolkeFile>[1]
) => ReturnType<typeof downloadWolkeFile>;

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const mimeOf = (name: string): string =>
  IMAGE_MIME[name.split('.').pop()!.toLowerCase()] ?? 'image/jpeg';

export function turnImagesOf(
  state: Pick<ChatGraphState, 'imageAttachments' | 'wolkeFiles'> & {
    agentConfig?: Pick<ChatGraphState['agentConfig'], 'userId'> | null;
  },
  download: Download = downloadWolkeFile
): TurnImage[] {
  const userId = state.agentConfig?.userId ?? null;
  return listTurnImageRefs(state).map((entry): TurnImage => {
    if (entry.kind === 'anhang') {
      const image = state.imageAttachments![entry.index]!;
      return {
        name: entry.name,
        fromWolke: false,
        load: async () => ({ ok: true, image }),
      };
    }
    let pending: Promise<TurnImageLoad> | null = null;
    const fetchIt = async (): Promise<TurnImageLoad> => {
      if (!userId)
        return { ok: false, message: `„${entry.name}“ ist ohne Anmeldung nicht lesbar.` };
      try {
        const res = await download(userId, entry.ref);
        if (!res.ok) return { ok: false, message: res.message };
        if (res.buffer.length > MAX_BYTES || res.size > MAX_BYTES) {
          return { ok: false, message: `„${entry.name}“ ist zu groß.` };
        }
        return {
          ok: true,
          image: {
            name: entry.name,
            type: res.mimeType || mimeOf(entry.name),
            data: res.buffer.toString('base64'),
          },
        };
      } catch (err) {
        log.warn(
          `[turnImages] download of "${entry.name}" threw: ${err instanceof Error ? err.message : String(err)}`
        );
        return { ok: false, message: 'Download fehlgeschlagen' };
      }
    };
    return {
      name: entry.name,
      fromWolke: true,
      load: () => (pending ??= fetchIt()),
    };
  });
}
