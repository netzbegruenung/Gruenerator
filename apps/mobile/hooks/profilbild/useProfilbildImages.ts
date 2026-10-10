import { Skia, type SkImage } from '@shopify/react-native-skia';
import { useCallback, useEffect, useState } from 'react';
import { Image } from 'react-native';

import { PROFILBILD_ASSETS } from '../../components/profilbild/profilbildAssets';

import type { ProfilbildAssetSrc } from '@gruenerator/shared/profilbild';

type ProfilbildImages = Record<ProfilbildAssetSrc, SkImage>;

async function loadAsset(id: number): Promise<SkImage> {
  const data = await Skia.Data.fromURI(Image.resolveAssetSource(id).uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('Profilbild-Asset konnte nicht dekodiert werden.');
  return image;
}

export type ProfilbildImagesState =
  { status: 'loading' } | { status: 'ready'; images: ProfilbildImages } | { status: 'error' };

export function useProfilbildImages(): ProfilbildImagesState & { reload(): void } {
  const [state, setState] = useState<ProfilbildImagesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(PROFILBILD_ASSETS) as Array<[ProfilbildAssetSrc, number]>;
    Promise.all(entries.map(async ([src, id]) => [src, await loadAsset(id)] as const))
      .then((loaded) => {
        if (!cancelled) {
          setState({ status: 'ready', images: Object.fromEntries(loaded) as ProfilbildImages });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, reload };
}
