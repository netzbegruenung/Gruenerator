/**
 * The pieces of a composed sharepic that the editor's page ops rewrite
 * (`carouselChrome.ts`) as well as the composer: colours, ink rule, page dots,
 * the AT arrow assets, text measurement. Kept apart so the page ops, which
 * every canvas editor loads, do not pull in the whole composer.
 */
import { layoutRichTextBlock, type MeasureRun } from '@ggraphic/schema';
import { type SharepicColor, type SharepicCreatorLocale } from '@gruenerator/contracts';

import { getBrandTheme } from '../brand/theme';
import { COLORS } from '../utils/dreizeilenLayout';
import { createShape, type ShapeInstance } from '../utils/shapes';
import { measureTextWidthWithFont, runFont, type TextAccent } from '../utils/textUtils';

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
  // Themed grounds. Lila is the purple the federal party already sets
  // (die_gruenen, "Frauen im Bundestag", 10/2026).
  lila: '#744A9E',
  flieder: '#E4D7F2',
  violett: '#732982',
  // A gradient (`GRADIENTS` in composeSharepic); this is its flat middle.
  pride: '#8A1D86',
  // The EU flag's Reflex Blue (Commission Regulation 821/2014, annex II) and
  // a pale sky that carries it as ink.
  europablau: '#003399',
  himmelblau: '#DCE6F7',
};

/** The inks a theme brings besides its grounds. */
export const THEMA_INK = {
  /** Text in a flieder marker; a purple deep enough for 4.5:1 on flieder. */
  lilaDunkel: '#4A2A6E',
  /** The queer marker: flag yellow, with deep violet ink. */
  flaggenGelb: '#FFED00',
  violettDunkel: '#2E1240',
  /** The six stripes of the rainbow flag, red to violet. */
  regenbogen: ['#E40303', '#FF8C00', '#FFED00', '#008026', '#24408E', '#732982'],
  /** Progress Pride's chevron colours, for the stripes beyond the six. */
  progress: ['#000000', '#613915', '#5BCEFA', '#F5A9B8'],
  /** The EU flag's stars; 7.2:1 on europablau. */
  sternenGelb: '#FFCC00',
} as const;

/** The Progress Pride flag sticker a queer slide carries in its footer. */
export const PRIDE_FLAG_ASSET = 'progress-pride';

/** A europa slide's footer sign: the ring of stars on blue, the flag elsewhere. */
export const EUROPA_ASSETS = { sterne: 'europa-sterne', flagge: 'eu-flagge' } as const;

/** DE accent: a lime marker box. AT accent: a yellow Vollkorn line. */
export const LIME = '#BEFF60';

/**
 * AT emphasis: Vollkorn Black Italic (CI 2026 p. 22), the `bold italic` face
 * in typography.css — `italic` alone loads Bold Italic.
 */
export const AT_EMPHASIS_STYLE = 'bold italic' as const;

/**
 * The DE word mark: black (set in a tone by opacity) on light and grass green,
 * white on dark; `farbe` (sand lettering, yellow flower) for dark print grounds.
 */
export const DE_WORDMARK = {
  black: 'gruene-de-logo-schwarz',
  white: 'gruene-de-logo-weiss',
  farbe: 'gruene-de-logo',
} as const;

/** Lines a rich text takes — the same layout the editor's renderer runs. */
export function layoutTextLines(
  measure: MeasureText,
  value: string,
  width: number,
  size: number,
  family: string,
  weight: NonNullable<TextAccent['fontStyle']>,
  accent: TextAccent | null
) {
  // The renderer's own run fonts, so a Vollkorn run is measured in the face it is drawn in.
  const measureRun: MeasureRun = (t, style) => {
    const run = runFont(family, weight, style, accent);
    return measure(t, size, run.fontFamily, run.fontStyle);
  };
  return layoutRichTextBlock(value, width, measureRun);
}

/** The AT "swipe on" arrow is the posts' brush stroke: white, green on light ground. */
export const BRUSH_ARROW = { onDark: 'brush-arrow-weiss', onLight: 'brush-arrow-gruen' } as const;

const LIGHT: readonly SharepicColor[] = [
  'mint',
  'hellgrau',
  'creme',
  'weiss',
  'flieder',
  'himmelblau',
];

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
