import { describe, expect, it } from 'vitest';

import { imageElementInteraction } from './backgroundPhotoCrop';

const photo = { id: 'background-image', draggable: true, transformable: true };

describe('imageElementInteraction', () => {
  it('hält das Hintergrundfoto außerhalb des Ausschnitt-Modus fest, ohne Griffe', () => {
    expect(imageElementInteraction(photo, { cropping: false, legacyLocked: false })).toEqual({
      draggable: false,
      transformable: false,
    });
  });

  it('gibt im Ausschnitt-Modus frei, was die Config erlaubt', () => {
    expect(imageElementInteraction(photo, { cropping: true, legacyLocked: false })).toEqual({
      draggable: true,
      transformable: true,
    });
    expect(
      imageElementInteraction(
        { id: 'background-image', draggable: false, transformable: true },
        { cropping: true, legacyLocked: false }
      )
    ).toEqual({ draggable: false, transformable: true });
  });

  it('hängt beim Hintergrundfoto nicht am alten Fixieren', () => {
    expect(imageElementInteraction(photo, { cropping: true, legacyLocked: true })).toEqual({
      draggable: true,
      transformable: true,
    });
  });

  it('lässt andere Bilder wie bisher', () => {
    expect(
      imageElementInteraction(
        { id: 'logo', draggable: true, transformable: true },
        { cropping: false, legacyLocked: false }
      )
    ).toEqual({ draggable: true, transformable: true });
    expect(
      imageElementInteraction({ id: 'logo' }, { cropping: false, legacyLocked: false })
    ).toEqual({ draggable: true, transformable: false });
    expect(
      imageElementInteraction(
        { id: 'logo', draggable: true, transformable: true },
        { cropping: false, legacyLocked: true }
      )
    ).toEqual({ draggable: false, transformable: false });
  });
});
