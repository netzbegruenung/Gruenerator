import { generateIconDataUrl } from '@gruenerator/canvas-editor/stickerElements';
import { useEffect, useState } from 'react';

/** Icons are drawn at this height; the stage scales them down, the export never up. */
const ICON_RENDER_SIZE = 512;

/** A black SVG for CSS masks: the thumbnail takes its colour from the theme. */
export const iconMaskUrl = (iconId: string) => generateIconDataUrl(iconId, 64, '#000000');

/** The image source an emoji or icon is drawn with; icons in the given colour. */
async function elementImageSrc(element: ElementSource, color: string): Promise<string | null> {
  return element.kind === 'emoji'
    ? element.src
    : generateIconDataUrl(element.iconId, ICON_RENDER_SIZE, color);
}

export type ElementSource = { kind: 'emoji'; src: string } | { kind: 'icon'; iconId: string };

const keyOf = (el: ElementSource, color: string) =>
  el.kind === 'emoji' ? el.src : `${el.iconId}|${color}`;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * Loads the images of the placed elements for the Konva stage — icons in the
 * given colour, so they follow the badge's text colour. Returns a lookup that
 * is null for an element whose image is not in yet.
 */
export function useElementImages(
  elements: readonly ElementSource[],
  color: string
): (el: ElementSource) => HTMLImageElement | null {
  const [images, setImages] = useState<ReadonlyMap<string, HTMLImageElement>>(() => new Map());
  const wantedKey = elements.map((el) => keyOf(el, color)).join('\n');
  useEffect(() => {
    let cancelled = false;
    for (const el of elements) {
      const key = keyOf(el, color);
      if (images.has(key)) continue;
      void elementImageSrc(el, color)
        .then((src) => (src ? loadImage(src) : null))
        .then((image) => {
          if (!cancelled && image) setImages((m) => new Map(m).set(key, image));
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the wanted images change
  }, [wantedKey]);
  return (el) => images.get(keyOf(el, color)) ?? null;
}
