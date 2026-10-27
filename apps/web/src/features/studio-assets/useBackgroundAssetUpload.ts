import { type StudioAssetItem } from '@gruenerator/contracts';
import {
  assetFormBody,
  TITLE_MAX,
  useStudioAssetMutations,
  type StudioAssetFormValues,
} from '@gruenerator/shared/studio-assets';
import { useCallback, useRef } from 'react';

import { uploadBlobToMediaShare } from '../image-studio/services/mediaUploadService';

import { BackgroundImageError, prepareBackgroundImage } from './backgroundImage';

const UPLOAD_ERROR = 'Das Hochladen hat nicht geklappt. Bitte versuche es erneut.';

/** A failure the person can act on; its message is meant for the UI. */
export class BackgroundUploadError extends Error {}

export const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, '').slice(0, TITLE_MAX);

/**
 * Bild vorbereiten, hochladen und als Hintergrund in der Galerie anlegen – für den
 * Hochlade-Dialog wie fürs Profilbild. Ein erneuter Versuch nach fehlgeschlagenem
 * Anlegen nutzt den schon hochgeladenen Datei-Upload, statt einen zweiten zu verwaisen.
 * Fehler beim Anlegen meldet der globale Mutation-Handler selbst.
 */
export function useBackgroundAssetUpload() {
  const { create } = useStudioAssetMutations();
  const uploaded = useRef<{ file: File; token: string } | null>(null);

  return useCallback(
    async (file: File, form: StudioAssetFormValues): Promise<StudioAssetItem> => {
      let shareToken = uploaded.current?.file === file ? uploaded.current.token : null;
      if (!shareToken) {
        try {
          const blob = await prepareBackgroundImage(file);
          const ext = blob.type === 'image/webp' ? 'webp' : 'png';
          shareToken = await uploadBlobToMediaShare(blob, {
            filename: `${titleFromFile(file.name) || 'hintergrund'}.${ext}`,
            uploadSource: 'studio-asset',
          });
        } catch (err) {
          if (err instanceof BackgroundImageError) throw new BackgroundUploadError(err.message);
        }
      }
      if (!shareToken) throw new BackgroundUploadError(UPLOAD_ERROR);
      uploaded.current = { file, token: shareToken };
      return create.mutateAsync({
        shareToken,
        kind: 'background',
        source: 'upload',
        ...assetFormBody(form),
      });
    },
    [create]
  );
}
