import { describe, it, expect } from 'vitest';

import { extractInheritablePageState } from './pageInheritance';

describe('extractInheritablePageState', () => {
  it('mirrors the image source into both keys', () => {
    expect(extractInheritablePageState({ currentImageSrc: '/a.jpg' })).toMatchObject({
      currentImageSrc: '/a.jpg',
      imageSrc: '/a.jpg',
    });
    expect(extractInheritablePageState({ imageSrc: '/b.jpg' })).toMatchObject({
      currentImageSrc: '/b.jpg',
      imageSrc: '/b.jpg',
    });
  });

  it('carries color scheme keys so a new page matches the deck', () => {
    expect(
      extractInheritablePageState({ colorScheme: 'tanne-sand', colorSchemeId: 'tanne-sand' })
    ).toEqual({ colorScheme: 'tanne-sand', colorSchemeId: 'tanne-sand' });
  });

  it('carries background transform and attribution', () => {
    const inherited = extractInheritablePageState({
      backgroundColor: '#005538',
      imageOffset: { x: 5, y: 6 },
      imageScale: 1.2,
      backgroundImageOpacity: 0.8,
      imageAttribution: { author: 'X' },
    });
    expect(inherited).toMatchObject({
      backgroundColor: '#005538',
      imageOffset: { x: 5, y: 6 },
      imageScale: 1.2,
      backgroundImageOpacity: 0.8,
      imageAttribution: { author: 'X' },
    });
  });

  it('infers backgroundMode image for image sources without an explicit mode', () => {
    expect(extractInheritablePageState({ currentImageSrc: '/a.jpg' }).backgroundMode).toBe('image');
    expect(
      extractInheritablePageState({ currentImageSrc: '/a.jpg', backgroundMode: 'color' })
        .backgroundMode
    ).toBe('color');
    expect('backgroundMode' in extractInheritablePageState({ headline: 'x' })).toBe(false);
  });

  it('skips empty values', () => {
    expect(extractInheritablePageState({ backgroundColor: '', colorScheme: null })).toEqual({});
  });
});
