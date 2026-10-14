/**
 * The pieces of a composed sharepic that the editor's page ops rewrite
 * (`carouselChrome.ts`) as well as the composer: colours, ink rule, page dots,
 * the AT arrow assets, text measurement. Kept apart so the page ops, which
 * every canvas editor loads, do not pull in the whole composer.
 */
import { type SharepicColor, type SharepicCreatorLocale } from '@gruenerator/contracts';

import { getBrandTheme } from '../brand/theme';
import { COLORS } from '../utils/dreizeilenLayout';
import { createShape, type ShapeInstance } from '../utils/shapes';
import { measureTextWidthWithFont } from '../utils/textUtils';

export type MeasureText = (
  text: string,
  fontSize: number,
  fontFamily: string,
  fontStyle: string
) => number;

export const defaultMeasure: MeasureText = (text, fontSize, fontFamily, fontStyle) =>
  measureTextWidthWithFont(text, fontSize, fontFamily, fontStyle);

export const SHAREPIC_COLOR_HEX: Record<SharepicColor, string> = {
  tanne: COLORS.TANNE,
  dunkeltanne: '#00261A',
  grasgruen: '#00CC4F',
  mint: '#D5EEE6',
  hellgrau: '#F2F2F2',
  // Measured on the candidates' text slides (Banaszak, 10/2026).
  creme: '#F5F1E8',
  aubergine: '#46102C',
  dunkelgruen: getBrandTheme('de-AT').colors.primary,
  hellgruen: getBrandTheme('de-AT').colors.secondary,
  weiss: '#FFFFFF',
};

/** The AT "swipe on" arrow is the posts' brush stroke: white, green on light ground. */
export const BRUSH_ARROW = { onDark: 'brush-arrow-weiss', onLight: 'brush-arrow-gruen' } as const;

const LIGHT: readonly SharepicColor[] = ['mint', 'hellgrau', 'creme', 'weiss'];

/**
 * How a surface takes ink: light ground (and DE grass green, which the posts
 * set dark) gets dark text, photos and dark colours white.
 */
export function inkOn(
  surface: SharepicColor | 'foto',
  locale: SharepicCreatorLocale
): { onLight: boolean; darkInk: boolean } {
  const onLight = surface !== 'foto' && LIGHT.includes(surface);
  const onGrass = locale !== 'de-AT' && surface === 'grasgruen';
  return { onLight, darkInk: onLight || onGrass };
}

/** The page dots of a carousel, a row centred on `centreX` with its top at `y`; the current one full. */
export function pageDots(
  count: number,
  index: number,
  centreX: number,
  y: number,
  ink: string
): ShapeInstance[] {
  const dot = 14;
  const gap = 12;
  const startX = centreX - (count * dot + (count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, k) =>
    Object.assign(
      createShape('circle', startX + k * (dot + gap) + dot / 2, y + dot / 2, ink, ink),
      {
        id: `sc-seite-${k}`,
        width: dot,
        height: dot,
        opacity: k === index ? 1 : 0.35,
      }
    )
  );
}
