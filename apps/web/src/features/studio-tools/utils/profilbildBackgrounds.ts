import { type FlatBackground, type PresetDesign } from '@gruenerator/shared/profilbild';

import { loadImage, type ProfilbildBackground } from './composeProfilbild';

const imageCache = new Map<string, Promise<HTMLImageElement>>();

/** Loads same-origin assets once per session; failed loads are retried next time. */
export function loadCachedImage(src: string) {
  let pending = imageCache.get(src);
  if (!pending) {
    pending = loadImage(src);
    imageCache.set(src, pending);
    pending.catch(() => imageCache.delete(src));
  }
  return pending;
}

export async function resolvePreset(design: PresetDesign): Promise<ProfilbildBackground> {
  const overlays = await Promise.all(
    design.overlays.map(async ({ src, ...rest }) => ({
      ...rest,
      image: await loadCachedImage(src),
    }))
  );
  return { kind: 'preset', base: design.base, overlays };
}

export function flatCss(bg: FlatBackground) {
  if (bg.kind === 'color') return bg.color;
  if (bg.kind === 'gradient') return `linear-gradient(${bg.angle}deg, ${bg.stops.join(', ')})`;
  const band = 100 / bg.colors.length;
  const stops = bg.colors.map((c, i) => `${c} ${i * band}% ${(i + 1) * band}%`);
  return `linear-gradient(180deg, ${stops.join(', ')})`;
}
