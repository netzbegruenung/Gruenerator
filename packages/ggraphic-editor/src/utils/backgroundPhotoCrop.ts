// SPDX-License-Identifier: MPL-2.0
import { BACKGROUND_IMAGE_NODE_ID } from './printImageInfo.js';

export interface ImageElementInteraction {
  draggable: boolean;
  transformable: boolean;
}

/**
 * Was ein Bild-Element auf der Fläche zulässt. Das Hintergrundfoto gehört wie
 * in Canva zur Seite: ziehen und zoomen nur im Ausschnitt-Modus, und auch dann
 * nur, soweit die Config es erlaubt.
 */
export function imageElementInteraction(
  config: { id: string; draggable?: boolean; transformable?: boolean },
  { cropping }: { cropping: boolean }
): ImageElementInteraction {
  // Ohne Angabe zieht CanvasImage (Vorgabe `draggable = true`).
  const draggable = config.draggable ?? true;
  const transformable = config.transformable === true;
  if (config.id === BACKGROUND_IMAGE_NODE_ID) {
    return { draggable: cropping && draggable, transformable: cropping && transformable };
  }
  return { draggable, transformable };
}

/**
 * Ob das Element den Ausschnitt-Modus hat: nur das Hintergrundfoto, und nur,
 * wenn der Modus dort Ziehen oder Zoomen freigibt (nicht das feste Fotoband in
 * veranstaltung). Fläche, Leiste und Menü fragen dasselbe. Ohne coverFit gibt
 * es keinen Ausschnitt zum Verschieben.
 */
export function canCropBackgroundPhoto(config: {
  id: string;
  draggable?: boolean;
  transformable?: boolean;
  coverFit?: boolean;
}): boolean {
  if (config.id !== BACKGROUND_IMAGE_NODE_ID || config.coverFit !== true) return false;
  const crop = imageElementInteraction(config, { cropping: true });
  return crop.draggable || crop.transformable;
}
