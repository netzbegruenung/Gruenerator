import {
  canCropBackgroundPhoto,
  imageElementInteraction,
} from '@ggraphic/editor/utils/backgroundPhotoCrop';
import { describe, expect, it } from 'vitest';

const photo = { id: 'background-image', draggable: true, transformable: true };

describe('imageElementInteraction', () => {
  it('hält das Hintergrundfoto außerhalb des Ausschnitt-Modus fest, ohne Griffe', () => {
    expect(imageElementInteraction(photo, { cropping: false })).toEqual({
      draggable: false,
      transformable: false,
    });
  });

  it('gibt im Ausschnitt-Modus frei, was die Config erlaubt', () => {
    expect(imageElementInteraction(photo, { cropping: true })).toEqual({
      draggable: true,
      transformable: true,
    });
    expect(
      imageElementInteraction(
        { id: 'background-image', draggable: false, transformable: true },
        { cropping: true }
      )
    ).toEqual({ draggable: false, transformable: true });
  });

  it('lässt andere Bilder wie bisher', () => {
    expect(
      imageElementInteraction(
        { id: 'logo', draggable: true, transformable: true },
        { cropping: false }
      )
    ).toEqual({ draggable: true, transformable: true });
    expect(imageElementInteraction({ id: 'logo' }, { cropping: false })).toEqual({
      draggable: true,
      transformable: false,
    });
  });
});

describe('canCropBackgroundPhoto', () => {
  it('gilt nur für das Hintergrundfoto, das der Modus zieht oder zoomt', () => {
    expect(
      canCropBackgroundPhoto({ id: 'background-image', draggable: true, coverFit: true })
    ).toBe(true);
    expect(
      canCropBackgroundPhoto({
        id: 'background-image',
        draggable: false,
        transformable: true,
        coverFit: true,
      })
    ).toBe(true);
  });

  it('fehlt ohne coverFit: dann gibt es keinen Ausschnitt', () => {
    expect(canCropBackgroundPhoto({ id: 'background-image', draggable: true })).toBe(false);
  });

  it('fehlt beim festen Fotoband (veranstaltung) und bei anderen Bildern', () => {
    expect(canCropBackgroundPhoto({ id: 'background-image', draggable: false })).toBe(false);
    expect(canCropBackgroundPhoto({ id: 'logo', draggable: true, transformable: true })).toBe(
      false
    );
  });
});
