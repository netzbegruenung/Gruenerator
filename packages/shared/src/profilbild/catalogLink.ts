import { systemStickerById } from '../stickers/catalog.js';

import { allPresetDesigns } from './backgrounds.js';

/** A sticker or background from the catalogue, handed to the Profilbild by link (a collection). */
export interface ProfilbildCatalogPick {
  kind: 'sticker' | 'background';
  id: string;
  title: string;
}

/** The link params for a pick: `?sticker=<id>` or `?hintergrund=<id>`. */
export const profilbildCatalogParams = (
  pick: Pick<ProfilbildCatalogPick, 'kind' | 'id'>
): Record<string, string> =>
  pick.kind === 'sticker' ? { sticker: pick.id } : { hintergrund: pick.id };

/** Reads a pick back; an id the catalogue does not know is ignored. */
export function parseProfilbildCatalogParams(params: {
  get(key: string): string | null;
}): ProfilbildCatalogPick | null {
  const stickerId = params.get('sticker');
  if (stickerId) {
    const sticker = systemStickerById(stickerId);
    return sticker ? { kind: 'sticker', id: sticker.id, title: sticker.label } : null;
  }
  const backgroundId = params.get('hintergrund');
  if (!backgroundId) return null;
  const design = [...allPresetDesigns(false), ...allPresetDesigns(true)].find(
    (d) => d.id === backgroundId
  );
  return design ? { kind: 'background', id: design.id, title: design.label } : null;
}
