import { type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { composeSharepic } from './composeSharepic';

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const UPLOAD_URL = '/api/share/0123456789abcdef0123456789abcdef/download';
const photoSrc = (filename: string) =>
  filename === 'upload:1' ? UPLOAD_URL : `/api/image-picker/stock-image/${filename}`;

const slide = (background: SharepicSlide['background']): SharepicSlide => ({
  background,
  position: 'unten',
  align: 'links',
  items: [{ type: 'headline', lines: ['Mach mit', 'bei uns!'], akzent: 1 }],
  logo: true,
});
const spec = (background: SharepicSlide['background']): SharepicSpec => ({
  locale: 'de-DE',
  slides: [slide(background)],
});

describe('composeSharepic with an own photo', () => {
  it.each([
    { kind: 'foto', filename: 'upload:1', textSeite: 'unten' },
    { kind: 'foto-oben', filename: 'upload:1', panelColor: 'tanne' },
    { kind: 'foto-unten', filename: 'upload:1', panelColor: 'tanne' },
  ] as const)('puts the library url on the canvas: $kind', (background) => {
    const props = composeSharepic(spec(background), { photoSrc, measure }).slides[0]!;
    expect(props.currentImageSrc).toBe(UPLOAD_URL);
  });

  it('tints an own photo on an AT strip like a stock photo', () => {
    const background = {
      kind: 'foto-oben',
      filename: 'upload:1',
      panelColor: 'dunkelgruen',
    } as const;
    const props = composeSharepic(
      { locale: 'de-AT', slides: [slide(background)] },
      { photoSrc, measure }
    ).slides[0]!;
    expect(props.shapeInstances.find((s) => s.id === 'sc-tint')?.blendMode).toBe('color');
  });

  it('asks for the tone by the upload id and darkens the text side accordingly', () => {
    const asked: string[] = [];
    const background = { kind: 'foto', filename: 'upload:1', textSeite: 'unten' } as const;
    const scrimAlpha = (tone: 'hell' | 'dunkel') =>
      composeSharepic(spec(background), {
        photoSrc,
        measure,
        photoTone: (filename) => {
          asked.push(filename);
          return tone;
        },
      })
        .slides[0]!.shapeInstances.find((s) => s.id === 'sc-scrim')
        ?.fillGradient?.stops.at(-1)?.color;
    const bright = scrimAlpha('hell');
    const dark = scrimAlpha('dunkel');
    expect(new Set(asked)).toEqual(new Set(['upload:1']));
    expect(bright).toMatch(/^rgba\(/);
    expect(bright).not.toBe(dark);
  });
});
