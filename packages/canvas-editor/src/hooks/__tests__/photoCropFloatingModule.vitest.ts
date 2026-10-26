import { describe, expect, it } from 'vitest';

import { floatingModuleFor } from '../useFloatingModuleState';

import type { CanvasElementConfig, FullCanvasConfig } from '../../configs/types';

/** Ob die Leiste „Ausschnitt“ zeigt, liest sie aus der Config des Fotos. */
function canCrop(element: Partial<CanvasElementConfig>) {
  // Boundary: nur `elements` wird gelesen.
  const config = {
    elements: [{ id: 'background-image', type: 'image', x: 0, y: 0, ...element }],
  } as unknown as FullCanvasConfig;
  return floatingModuleFor('background-image', config, {}, {})?.data.canCrop;
}

describe('canCrop des Hintergrundfotos', () => {
  it('gilt für ein ziehbares oder zoombares Foto, auch außerhalb des Modus', () => {
    expect(canCrop({ srcKey: 'currentImageSrc', draggable: true, transformable: true })).toBe(true);
    expect(canCrop({ srcKey: 'currentImageSrc', draggable: false, transformable: true })).toBe(
      true
    );
  });

  it('fehlt beim festen Fotoband (veranstaltung) und bei Deko-Bildern', () => {
    expect(canCrop({ srcKey: 'currentImageSrc', draggable: false })).toBe(false);
    expect(canCrop({ src: '/deko.png', draggable: true })).toBe(false);
  });
});
