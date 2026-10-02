import { describe, expect, it } from 'vitest';

import { readHandoff } from './freitextHandoff';

const photo = { name: 'a.jpg', url: '/api/share/x/download', analysis: { motiv: 'x' } };

describe('readHandoff', () => {
  it('reads the prompt and the photos', () => {
    expect(readHandoff({ prompt: '  Mehr Busse  ', photos: [photo] })).toEqual({
      prompt: 'Mehr Busse',
      photos: [photo],
    });
  });

  it('lets a photo carry the request alone', () => {
    expect(readHandoff({ prompt: '', photos: [photo] })).toEqual({ prompt: '', photos: [photo] });
  });

  it('drops entries that are no photo', () => {
    expect(
      readHandoff({ prompt: 'Mehr Busse', photos: [photo, { url: 1 }, null, 'x'] })?.photos
    ).toEqual([photo]);
  });

  it('reads nothing a draft could start from as null', () => {
    expect(readHandoff(null)).toBeNull();
    expect(readHandoff({ mode: 'sharepic' })).toBeNull();
    expect(readHandoff({ prompt: 'ok' })).toBeNull();
    expect(readHandoff({ prompt: 'Mehr Busse', photos: 'x' })?.photos).toEqual([]);
  });
});
