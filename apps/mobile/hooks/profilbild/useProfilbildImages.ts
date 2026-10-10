import { Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
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

export function useProfilbildImages(): ProfilbildImages | null {
  const [images, setImages] = useState<ProfilbildImages | null>(null);

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(PROFILBILD_ASSETS) as Array<[ProfilbildAssetSrc, number]>;
    Promise.all(entries.map(async ([src, id]) => [src, await loadAsset(id)] as const))
      .then((loaded) => {
        if (!cancelled) setImages(Object.fromEntries(loaded) as ProfilbildImages);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return images;
}
