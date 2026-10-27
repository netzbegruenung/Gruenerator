import { type ComposerBrand, onGround } from '@ggraphic/editor/brand/composerBrand';
import { type TextAccent, type TextMarker } from '@ggraphic/editor/utils/textUtils';

import { type BrandTheme, type GrueneBrandId } from '../brand/theme';

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
  brand,
  brandId,
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
  brand: ComposerBrand;
  /** Which of a theme's per-brand accents applies. */
  brandId: GrueneBrandId;
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
  // The ground under the footer and under the top corner, where a theme's
  // sign stands: a photo strip or the card under a header band, not always
  // the text's surface.
  const footerGround: SharepicColor | 'foto' =
    kopfband && bg.kind === 'farbe' ? bg.color : footerOnPhoto ? 'foto' : surface;
  const topGround: SharepicColor | 'foto' =
    bg.kind === 'foto-oben' || bild?.ausschnitt === 'streifen-oben' ? 'foto' : surface;
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
  // `==word==` runs in the brand's accent; a theme brings its own per brand
  // and side (`SHAREPIC_THEMES`), `null` where the brand's stays.
  const def = sharepicTheme(thema);
  const side = onLight ? 'light' : 'dark';
  const ground = { onLight, onGrass };
  const emphasis = brand.accent.emphasis
    ? { fontFamily: theme.fonts.quoteEmphasis, fontStyle: AT_EMPHASIS_STYLE }
    : {};
  const accent: TextAccent = {
    fill:
      (def ? onGround(def.accent[brandId], ground) : null) ?? onGround(brand.accent.fill, ground),
    ...emphasis,
  };
  // DE `++passage++`: dark ink in a box. On light ground (white, grey, mint)
  // the posts lay lime under it (Dds8o0TAppl, DdEhd82js3K, Dc3HYlTAnG-);
  // photos and dark colours take white — a dark box disappears into the
  // scrim. A brand without the box has none (see `foldMarkers`). Themes
  // bring their own box.
  const themedMarker = def?.marker[side] ?? null;
  const marker: TextMarker | null = brand.features.markerBox
    ? {
        fill:
          themedMarker?.fill ?? (surface === 'creme' ? MARKER_MINT : onLight ? LIME : '#FFFFFF'),
        color: themedMarker?.ink ?? SHAREPIC_COLOR_HEX.dunkeltanne,
        // Tighter than the editor's default: the space beside a mid-line box
        // must stay visible, as on the posts.
        padX: MARKER_PAD_X,
      }
    : null;
  // A DE headline's accent line (`akzent`): dark text on a box. Lime glows on
  // dark ground; on mint it washes out — grass green there; on grass green
  // itself a white box. A theme sets its marker box.
  const accentLineBox = def?.marker[side] ?? {
    fill: onGrass ? '#FFFFFF' : onLight ? SHAREPIC_COLOR_HEX.grasgruen : LIME,
    ink: SHAREPIC_COLOR_HEX.dunkeltanne,
  };
  // A topic icon in a circle, unless the theme recolours it.
  const badgeColors = def?.badge?.[side] ?? { ...onGround(brand.badge, { onLight, onGrass }) };
  const cardAccentFill = def?.cardAccent ?? brand.cardAccent;
  const cardAccent: TextAccent = { fill: cardAccentFill, ...emphasis };
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
    footerGround,
    topGround,
    shadow,
    accent,
    marker,
    accentLineBox,
    badgeColors,
    cardAccent,
    accentInk,
    contrastPanel,
  };
}
