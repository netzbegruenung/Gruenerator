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
import { uploadBlobToMediaLibrary } from '../../image-studio/services/mediaUploadService';
import { fileToDownscaledDataUrl } from '../../image-studio/utils/downscaleImage';

export type ProfilbildSaveBackground =
  | Extract<SavedProfilbildBackground, { kind: 'id' }>
  /** The person's own photo: already stored (`url`) or still only a local file. */
  | { kind: 'custom'; url: string | null; file: File | null };

export interface ProfilbildSaveInput {
  imageDataUrl: string;
  /** The trimmed cutout as a data URL; only sent with the first save. */
  cutoutDataUrl: string;
  person: SavedProfilbild['person'];
  background: ProfilbildSaveBackground;
  stickers: SavedProfilbild['stickers'];
}

/**
 * Saves exported Profilbilder like canvas sharepics: one `shared_media` row per
 * editor session, created on the first export and updated on every later one,
 * so it shows under „Zuletzt" and reopens with its editor state. The cutout is
 * the share's original image; an own background photo goes to the media store.
 */
export function useProfilbildShare(initialShareToken: string | null) {
  const { createImageShare, updateImageShare } = useShareStore();
  const queryClient = useQueryClient();
  const shareToken = useRef(initialShareToken);
  const uploaded = useRef(new WeakMap<File, string>());
  // Serialised: a second export before the first create returned must update, not duplicate.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const storeBackground = useCallback(
    async (bg: ProfilbildSaveBackground): Promise<SavedProfilbildBackground | null> => {
      if (bg.kind === 'id') return bg;
      if (bg.url) return { kind: 'custom', url: bg.url };
      if (!bg.file) return null;
      const known = uploaded.current.get(bg.file);
      if (known) return { kind: 'custom', url: known };
      const blob = await (await fetch(await fileToDownscaledDataUrl(bg.file))).blob();
      const url = await uploadBlobToMediaLibrary(blob, {
        filename: 'profilbild-hintergrund.jpg',
        uploadSource: 'profilbild-background',
      });
      if (!url) return null;
      uploaded.current.set(bg.file, url);
      return { kind: 'custom', url };
    },
    []
  );

  const persist = useCallback(
    async (input: ProfilbildSaveInput) => {
      const background = await storeBackground(input.background);
      if (!background) throw new Error('Hintergrundbild konnte nicht gespeichert werden.');
      const saved: SavedProfilbild = {
        v: 1,
        person: input.person,
        background,
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
      await queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
    },
    [createImageShare, updateImageShare, queryClient, storeBackground]
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
