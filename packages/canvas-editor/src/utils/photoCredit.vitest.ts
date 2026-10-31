import { describe, expect, it } from 'vitest';

import { photoCreditLine, withPhotoCredit } from '@ggraphic/editor/utils/photoCredit';

const jane = {
  photographer: 'Jane Doe',
  profileUrl: 'https://unsplash.com/@jane',
  photoUrl: 'https://unsplash.com/photos/a',
  instagramUsername: 'janedoe',
};
const max = {
  photographer: 'Max Muster',
  profileUrl: 'https://unsplash.com/@max',
  photoUrl: 'https://unsplash.com/photos/b',
};

describe('photoCreditLine', () => {
  it('credits the photographer, their Instagram handle and Unsplash', () => {
    expect(photoCreditLine([jane])).toBe('Foto: Jane Doe (@janedoe) auf Unsplash');
  });

  it('lists several photos once each and skips missing credits', () => {
    expect(photoCreditLine([jane, null, max, { ...jane }])).toBe(
      'Fotos: Jane Doe (@janedoe), Max Muster auf Unsplash'
    );
  });

  it('is empty without a photo', () => {
    expect(photoCreditLine([undefined, null])).toBe('');
  });
});

describe('withPhotoCredit', () => {
  it('appends the credit after a blank line', () => {
    expect(withPhotoCredit('Mehr Radwege! ', 'Foto: Max Muster auf Unsplash')).toBe(
      'Mehr Radwege!\n\nFoto: Max Muster auf Unsplash'
    );
  });

  it('leaves the text alone without a credit and stands alone without a text', () => {
    expect(withPhotoCredit('Text', '')).toBe('Text');
    expect(withPhotoCredit('', 'Foto: X auf Unsplash')).toBe('Foto: X auf Unsplash');
  });
});
