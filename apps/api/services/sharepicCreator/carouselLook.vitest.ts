import { type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { carouselLookProblems } from './carouselLook.js';
import { loadExamples } from './styleguide.js';

type Bg = SharepicSlide['background'];
const farbe = (color: string): Bg => ({ kind: 'farbe', color }) as Bg;
const unten = (panelColor: string): Bg =>
  ({ kind: 'foto-unten', filename: 'x.jpg', panelColor }) as Bg;
const foto: Bg = { kind: 'foto', filename: 'x.jpg', textSeite: 'unten' } as Bg;

function deck(
  backgrounds: Bg[],
  align: SharepicSlide['align'][] = [],
  locale: SharepicSpec['locale'] = 'de-DE'
): SharepicSpec {
  return {
    locale,
    slides: backgrounds.map((background, i) => ({
      background,
      position: 'oben',
      align: align[i] ?? 'links',
      items: [{ type: 'absatz', text: 'Text' }],
      logo: false,
    })),
  } as SharepicSpec;
}

describe('carouselLookProblems', () => {
  it('accepts one surface throughout, the cover on a photo panel', () => {
    expect(
      carouselLookProblems(
        deck([
          unten('dunkeltanne'),
          farbe('dunkeltanne'),
          farbe('dunkeltanne'),
          farbe('dunkeltanne'),
        ])
      )
    ).toBeNull();
  });

  it('accepts demands and close moving together to a second surface', () => {
    // DE-1 in the corpus: a photo story, then „Unsere Forderungen" and the closing line on mint.
    expect(
      carouselLookProblems(
        deck(
          [foto, foto, foto, foto, farbe('mint'), farbe('mint')],
          ['zentriert', 'zentriert', 'zentriert', 'zentriert', 'links', 'zentriert']
        )
      )
    ).toBeNull();
  });

  it('rejects a zig-zag of surfaces', () => {
    const problem = carouselLookProblems(
      deck([
        farbe('dunkeltanne'),
        farbe('mint'),
        farbe('dunkeltanne'),
        farbe('grasgruen'),
        farbe('mint'),
      ])
    );
    expect(problem).toContain('dunkeltanne → mint → dunkeltanne → grasgruen → mint');
  });

  it('rejects demands and close on two different new surfaces', () => {
    expect(
      carouselLookProblems(
        deck([foto, foto, foto, farbe('mint'), farbe('grasgruen')], Array(5).fill('zentriert'))
      )
    ).toContain('höchstens EIN Wechsel');
  });

  it('keeps a fixed colour to the end', () => {
    // dunkeltanne slides then mint for demands and close: never in the corpus.
    expect(
      carouselLookProblems(
        deck([
          unten('dunkeltanne'),
          farbe('dunkeltanne'),
          farbe('dunkeltanne'),
          farbe('mint'),
          farbe('mint'),
        ])
      )
    ).toContain('nimm überall dunkeltanne');
  });

  it('allows a colour change right after the cover', () => {
    expect(
      carouselLookProblems(deck([farbe('tanne'), farbe('mint'), farbe('mint'), farbe('mint')]))
    ).toBeNull();
  });

  it('rejects a change in the middle', () => {
    expect(
      carouselLookProblems(
        deck([
          farbe('dunkeltanne'),
          farbe('dunkeltanne'),
          farbe('mint'),
          farbe('mint'),
          farbe('mint'),
          farbe('mint'),
        ])
      )
    ).toContain('mitten im Karussell auf Slide 3');
  });

  it('rejects a German photo on single slides in the middle', () => {
    expect(
      carouselLookProblems(
        deck([
          unten('dunkeltanne'),
          farbe('dunkeltanne'),
          unten('dunkeltanne'),
          farbe('dunkeltanne'),
          farbe('mint'),
          farbe('mint'),
        ])
      )
    ).toContain('mischen Fotos und Farbflächen');
  });

  it('leaves Austrian photo textures alone', () => {
    // DciRZ-EiKAS: photo panels and plain green alternate under one surface.
    expect(
      carouselLookProblems(
        deck(
          [
            foto,
            unten('dunkelgruen'),
            farbe('dunkelgruen'),
            unten('dunkelgruen'),
            farbe('dunkelgruen'),
          ],
          [],
          'de-AT'
        )
      )
    ).toBeNull();
  });

  it('rejects alignment flipping between cover and close', () => {
    expect(
      carouselLookProblems(
        deck(
          [farbe('mint'), farbe('mint'), farbe('mint'), farbe('mint'), farbe('mint')],
          ['links', 'zentriert', 'links', 'zentriert', 'zentriert']
        )
      )
    ).toContain('Ausrichtung');
  });

  it('leaves single slides and pairs alone', () => {
    expect(carouselLookProblems(deck([farbe('mint'), farbe('grasgruen')]))).toBeNull();
  });

  it('lets a GRÜNE JUGEND carousel alternate two colours, not three', () => {
    const gj = (colors: string[]) =>
      ({ ...deck(colors.map(farbe)), brand: 'gruene-jugend' }) as SharepicSpec;
    expect(carouselLookProblems(gj(['apricot', 'weiss', 'weiss', 'apricot']))).toBeNull();
    expect(carouselLookProblems(gj(['apricot', 'weiss', 'pink', 'apricot']))).not.toBeNull();
  });

  // The model copies the examples: one that breaks the rule teaches the zig-zag.
  // beispiele.json is untyped JSON: the cast is the boundary.
  const carousels = loadExamples()
    .map(
      (e) =>
        [
          e.id,
          { ...e.spec, locale: e.land, ...(e.brand && { brand: e.brand }) } as SharepicSpec,
        ] as const
    )
    .filter(([, spec]) => spec.slides.length >= 3);
  it.each(carousels)('example %s holds one look', (_id, spec) => {
    expect(carouselLookProblems(spec)).toBeNull();
  });
});
