import { type SharepicSlide } from '@gruenerator/contracts';
import { beforeAll, describe, it, expect } from 'vitest';

import { composeSharepic } from '../composer/composeSharepic';

import { loadCanvasConfig } from './configLoader';
import { extractInheritablePageState } from './pageInheritance';

import type { ShapeInstance } from '../utils/shapes';

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

  describe('from a composed sharepic', () => {
    const composed = (locale: 'de-DE' | 'de-AT', background: SharepicSlide['background']) =>
      composeSharepic(
        {
          locale,
          slides: [
            {
              background,
              position: 'mitte',
              align: 'links',
              items: [{ type: 'absatz', text: 'Ein Satz, der etwas erklärt.' }],
              logo: false,
            },
          ],
        },
        { photoSrc: (f) => `/media/${f}`, measure: (t, size) => t.length * size * 0.5 }
      ).slides[0] as unknown as Record<string, unknown>;
    // A cold import of the freeform config takes seconds; outside the 5 s test budget.
    let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
    beforeAll(async () => {
      config = await loadCanvasConfig('freeform');
    }, 30_000);
    const ids = (state: Record<string, unknown>) =>
      ((state.shapeInstances ?? []) as ShapeInstance[]).map((s) => s.id);

    it('gives a new freeform page the strip panel its shifted photo needs', () => {
      const source = composed('de-DE', {
        kind: 'foto-oben',
        filename: 'wind.jpg',
        panelColor: 'tanne',
      });
      const page = config.createInitialState(
        extractInheritablePageState(source, 'freeform')
      ) as Record<string, unknown>;
      expect(page.imageOffset).toEqual(source.imageOffset);
      expect(ids(page)).toEqual(['sc-panel']);
      expect(page.layerOrder).toEqual(['sc-panel']);
      const panel = (page.shapeInstances as ShapeInstance[])[0]!;
      expect(panel.locked).toBe(true);
      expect(panel).toEqual((source.shapeInstances as ShapeInstance[])[0]);
      // Only the background: no text, no logo, no chrome.
      expect(page.additionalTexts).toEqual([]);
    });

    it('carries the AT strip tint and a gradient plane, in their order', () => {
      const strip = composed('de-AT', {
        kind: 'foto-unten',
        filename: 'wind.jpg',
        panelColor: 'weiss',
      });
      expect(ids(extractInheritablePageState(strip, 'freeform-at'))).toEqual([
        'sc-panel',
        'sc-tint',
      ]);
      const gradient = composed('de-AT', { kind: 'farbe', color: 'dunkelgruen' });
      expect(ids(extractInheritablePageState(gradient, 'freeform-at'))).toEqual(['sc-bg']);
    });

    it('re-centres the photo for a template that does not take the planes', () => {
      const source = composed('de-DE', {
        kind: 'foto-unten',
        filename: 'wind.jpg',
        panelColor: 'tanne',
      });
      const inherited = extractInheritablePageState(source, 'zitat');
      expect(inherited.currentImageSrc).toBe('/media/wind.jpg');
      expect(inherited).not.toHaveProperty('imageOffset');
      expect(inherited).not.toHaveProperty('imageScale');
      expect(inherited).not.toHaveProperty('shapeInstances');
    });

    it('leaves a plain page without planes as it was', () => {
      expect(
        extractInheritablePageState(
          { backgroundColor: '#005538', shapeInstances: [{ id: 'mine' }] },
          'freeform'
        )
      ).toEqual({ backgroundColor: '#005538' });
    });
  });
});
