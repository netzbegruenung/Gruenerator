import { type BrandTheme } from '../brand/theme';
import { type TextAccent, type TextMarker } from '../utils/textUtils';

import { AT_EMPHASIS_STYLE, inkOn, LIME, SHAREPIC_COLOR_HEX } from './chromeParts';
import { type BildItem } from './composeTypes';
import { VERGLEICH_MARKER_IDS } from './sharepicIcons';
import { KLEE, MARKER_MINT, MARKER_PAD_X } from './sharepicLayoutConstants';
import { sharepicTheme } from './sharepicThemes';

import type {
  SharepicColor,
  SharepicCreatorLocale,
  SharepicSlide,
  SharepicThema,
} from '@gruenerator/contracts';

/** The inks a slide's text, accents, badges and footer take on its surface. */
export function slideInk({
  locale,
  isAt,
  theme,
  surface,
  darkText,
  kopfband,
  bg,
  bild,
  thema,
}: {
  locale: SharepicCreatorLocale;
  isAt: boolean;
  theme: BrandTheme;
  surface: SharepicColor | 'foto';
  darkText: string;
  kopfband: SharepicColor | null;
  bg: SharepicSlide['background'];
  bild: BildItem | null;
  /** A themed slide recolours accent, marker and badges (see `SHAREPIC_THEMES`). */
  thema: SharepicThema | null;
}) {
  const { onLight, darkInk } = inkOn(surface, locale);
  const onGrass = darkInk && !onLight;
  const textColor = darkInk ? darkText : '#FFFFFF';
  // Logo and arrow sit in the footer: on `foto-unten` that is the photo, not the panel.
  // Under a header band the footer stands on the card's ground.
  const footerInk = kopfband && bg.kind === 'farbe' ? inkOn(bg.color, locale) : null;
  const footerOnPhoto = bg.kind === 'foto-unten' || bild?.ausschnitt === 'streifen-unten';
  const footerOnLight = footerInk ? footerInk.onLight : !footerOnPhoto && onLight;
  const footerDarkInk = footerInk ? footerInk.darkInk : !footerOnPhoto && darkInk;
  const shadow =
    surface === 'foto'
      ? {
          shadowColor: '#000000',
          shadowBlur: 18,
          shadowOffsetX: 0,
          shadowOffsetY: 2,
          shadowOpacity: 0.45,
        }
      : {};
  // `==word==` runs: AT sets them yellow in Vollkorn Black Italic, DE in lime.
  // A theme brings its own per side (`SHAREPIC_THEMES`); AT keeps its yellow
  // on dark ground.
  const def = sharepicTheme(thema);
  const side = onLight ? 'light' : 'dark';
  const deAccent = def
    ? onGrass && 'grass' in def.accent
      ? def.accent.grass
      : def.accent[side]
    : null;
  const accent: TextAccent = isAt
    ? {
        fill: onLight ? (def?.atAccentOnLight ?? theme.colors.accentOnLight) : theme.colors.accent,
        fontFamily: theme.fonts.quoteEmphasis,
        fontStyle: AT_EMPHASIS_STYLE,
      }
    : { fill: deAccent ?? (onLight ? KLEE : onGrass ? '#FFFFFF' : LIME) };
  // DE `++passage++`: dark ink in a box. On light ground (white, grey, mint)
  // the posts lay lime under it (Dds8o0TAppl, DdEhd82js3K, Dc3HYlTAnG-);
  // photos and dark colours take white — a dark box disappears into the
  // scrim. AT has none (see `foldMarkers`). Themes bring their own box.
  const themedMarker = def?.marker[side] ?? null;
  const marker: TextMarker | null = isAt
    ? null
    : {
        fill:
          themedMarker?.fill ?? (surface === 'creme' ? MARKER_MINT : onLight ? LIME : '#FFFFFF'),
        color: themedMarker?.ink ?? SHAREPIC_COLOR_HEX.dunkeltanne,
        // Tighter than the editor's default: the space beside a mid-line box
        // must stay visible, as on the posts.
        padX: MARKER_PAD_X,
      };
  // A topic icon in a circle — DE Klee on light ground, Tanne on grass green,
  // lime on dark ground and photos; AT the yellow accent, its dark green on white.
  const badgeColors =
    def?.badge?.[side] ??
    (isAt
      ? onLight
        ? { fill: theme.colors.primary, ink: '#FFFFFF' }
        : { fill: theme.colors.accent, ink: theme.colors.primary }
      : onLight
        ? { fill: KLEE, ink: '#FFFFFF' }
        : onGrass
          ? { fill: SHAREPIC_COLOR_HEX.tanne, ink: '#FFFFFF' }
          : { fill: LIME, ink: SHAREPIC_COLOR_HEX.dunkeltanne });
  const cardAccentFill = def?.cardAccent ?? (isAt ? theme.colors.accentOnLight : KLEE);
  const cardAccent: TextAccent = isAt
    ? { ...accent, fill: cardAccentFill }
    : { fill: cardAccentFill };
  /** A figure, a numeral or a closing "!" in the slide's accent colour. */
  const accentInk = accent.fill;
  /**
   * The two sides of a contrast, as the posts set them: theirs (a comparison's
   * left, a fact check's claim) muted with ✗, ours on the accent with ✓.
   */
  const contrastPanel = (side: 'theirs' | 'ours') => {
    const muted = isAt && !onLight ? '#FFFFFF' : darkText;
    return side === 'theirs'
      ? {
          // DE: a pale panel that stays visible on pale ground; AT: a veil.
          fill: isAt
            ? muted
            : surface === 'hellgrau' || surface === 'weiss' || surface === 'creme'
              ? SHAREPIC_COLOR_HEX.mint
              : SHAREPIC_COLOR_HEX.hellgrau,
          fillOpacity: isAt ? (onLight ? 0.08 : 0.15) : 1,
          ink: muted,
          inkOpacity: 0.7,
          accent: isAt ? accent : { fill: KLEE },
          marker: VERGLEICH_MARKER_IDS.links,
        }
      : {
          fill: isAt
            ? theme.colors.accent
            : onGrass
              ? SHAREPIC_COLOR_HEX.tanne
              : SHAREPIC_COLOR_HEX.grasgruen,
          fillOpacity: 1,
          ink: !isAt && onGrass ? '#FFFFFF' : darkText,
          inkOpacity: 1,
          // White on grasgruen is 2.2:1. Tanne in bold italic stays legible as
          // large text (4.1:1) and stands apart from the dunkeltanne body,
          // even from a fact set bold.
          accent: isAt
            ? { ...accent, fill: theme.colors.primary }
            : onGrass
              ? { fill: LIME }
              : ({ fill: SHAREPIC_COLOR_HEX.tanne, fontStyle: 'bold italic' } satisfies TextAccent),
          marker: VERGLEICH_MARKER_IDS.rechts,
        };
  };
  return {
    onLight,
    darkInk,
    onGrass,
    textColor,
    footerOnLight,
    footerDarkInk,
    shadow,
    accent,
    marker,
    badgeColors,
    cardAccent,
    accentInk,
    contrastPanel,
  };
}
