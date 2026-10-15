import {
  PROFILBILD_IMAGE_TYPE,
  PROFILBILD_METADATA_KEY,
  type SavedProfilbild,
  type SavedProfilbildBackground,
} from '@gruenerator/shared/profilbild';
import { useShareStore } from '@gruenerator/shared/share';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

import apiClient from '../../../components/utils/apiClient';
import { RECENT_PROFILBILDER_KEY } from '../components/RecentProfilbilder';

export interface ProfilbildSaveInput {
  imageDataUrl: string;
  /** The trimmed cutout as a data URL; only sent with the first save. */
  cutoutDataUrl: string;
  person: SavedProfilbild['person'];
  background: SavedProfilbildBackground;
  stickers: SavedProfilbild['stickers'];
}

/**
 * Saves exported Profilbilder like canvas sharepics: one `shared_media` row per
 * editor session, created on the first export and updated on every later one,
 * so it shows under „Zuletzt" and reopens with its editor state. The cutout is
 * the share's original image; an own background is a gallery item, saved by path.
 */
export function useProfilbildShare(initialShareToken: string | null) {
  const { createImageShare, updateImageShare } = useShareStore();
  const queryClient = useQueryClient();
  const shareToken = useRef(initialShareToken);
  // Serialised: a second export before the first create returned must update, not duplicate.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const persist = useCallback(
    async (input: ProfilbildSaveInput) => {
      const saved: SavedProfilbild = {
        v: 1,
        person: input.person,
        background: input.background,
        stickers: input.stickers,
      };
      const metadata = { source: 'profilbild', [PROFILBILD_METADATA_KEY]: saved };
      if (shareToken.current) {
        await updateImageShare({
          shareToken: shareToken.current,
          imageBase64: input.imageDataUrl,
          title: 'Profilbild',
          metadata,
        });
      } else {
        const share = await createImageShare({
          imageData: input.imageDataUrl,
          title: 'Profilbild',
          imageType: PROFILBILD_IMAGE_TYPE,
          contentOrigin: 'sharepic',
          metadata,
          originalImage: input.cutoutDataUrl,
          status: 'ready',
        });
        shareToken.current = share.shareToken;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recent-activity'] }),
        queryClient.invalidateQueries({ queryKey: RECENT_PROFILBILDER_KEY }),
      ]);
    },
    [createImageShare, updateImageShare, queryClient]
  );

  return useCallback(
    (input: ProfilbildSaveInput) => {
      const run = queue.current.then(() => persist(input));
      queue.current = run.catch(() => {});
      return run;
    },
    [persist]
  );
}

/** Reads an owner-only `/api/share/...` file through the authenticated client, as a data URL. */
export async function loadShareFileDataUrl(path: string): Promise<string> {
  const res = await apiClient.get<Blob>(path.replace(/^\/api/, ''), { responseType: 'blob' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    reader.readAsDataURL(res.data);
  });
}
