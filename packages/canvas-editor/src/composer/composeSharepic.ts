/**
 * Sharepic spec → freeform canvas pages, one per slide.
 *
 * The free-text creator's model writes, per slide, ONE text group (kicker,
 * headline, paragraphs, text, quote, list, button) plus a background and a few
 * extras; this turns it into the element collections a person builds by hand
 * in the freeform editor, so the draft stays fully editable. The look follows
 * the parties' current Instagram posts (analysed 10/2026): one compact text
 * block, a headline that fills the width in sentence case, one accent, no flat
 * backgrounds, built contrast on photos. Carousels add what their slides share:
 * a "swipe on" arrow on every slide but the last, DE line boxes on photos.
 *
 * Pure: no React, no Konva. Text is measured through the injected `measure`.
 */
import { onGround } from '@ggraphic/editor/brand/composerBrand';
import { foldMarkers, stripMarks } from '@ggraphic/editor/composer/marks';
import { steckbriefPerson } from '@ggraphic/editor/composer/steckbriefLayout';
import {
  balancedWrap,
  largestSizeWordsFit,
  STOERER_RADII,
  wrapWords,
} from '@ggraphic/editor/composer/textFit';
import {
  DEFAULT_FORMAT_ID,
  getCanvasFormatOrDefault,
  type CanvasFormat,
} from '@ggraphic/editor/formats/index';
import { ASSET_TARGET_SIZE } from '@ggraphic/editor/utils/canvasAssets';
import { contrastRatio, luminance } from '@ggraphic/editor/utils/colorLuminance';
import { createPillBadgeInstance } from '@ggraphic/editor/utils/pillBadgeUtils';
import { createShape, type ShapeInstance } from '@ggraphic/editor/utils/shapes';
import { type TextAccent } from '@ggraphic/editor/utils/textUtils';
import {
  accentLines,
  brandIdFor,
  brandOfId,
  type SharepicBrandId,
  type SharepicColor,
  type SharepicCreatorLocale,
  type SharepicItem,
  type SharepicPhotoAttribution,
  type SharepicNummer,
  type SharepicSeitenzahl,
  type SharepicSlide,
  type SharepicSpec,
  type SharepicTextSide,
  type SharepicThema,
} from '@gruenerator/contracts';

import { getBrandPack, getBrandTheme } from '../brand/theme';
import { VERANSTALTUNG_CONFIG } from '../utils/veranstaltungLayout';

import { layoutAufruf } from './aufrufLayout';
import {
  AT_EMPHASIS_STYLE,
  defaultMeasure,
  layoutTextLines,
  SHAREPIC_COLOR_HEX,
  type MeasureText,
} from './chromeParts';
import {
  type BildItem,
  type Column,
  type ComposeOptions,
  type ComposedSharepic,
  type ComposedSlide,
  type Placed,
  type SteckbriefItem,
} from './composeTypes';
import { layoutDiagramm } from './diagrammLayout';
import { encodeHandMarks, sentinelBlind } from './handMarks';
import { headlineFit } from './headlineFit';
import { layoutInfografik } from './infografikLayout';
import { layoutBingo, layoutSchlagzeile, layoutTermine } from './kartenLayout';
import { layoutRechnung, layoutZahl } from './kennzahlLayout';
import { layoutIconliste, layoutListe } from './listeLayout';
import {
  GRADIENTS,
  SCRIM_DARK,
  SCRIM_GUTTER,
  SCRIM_TEXT_ALPHA,
  evenStops,
  scrimFill,
} from './sharepicGround';
import {
  ABSATZ_KLEIN,
  ARROW,
  BLUME,
  BOX_INK,
  CARD_ITEMS,
  DATE_CIRCLE,
  ETIKETT_ROOM,
  FOOTER,
  GAP,
  HEADLINE_COVER_MAX,
  HEADLINE_GROSS,
  HEADLINE_MAX,
  HEADLINE_RATIO,
  HEADLINE_WITH_CARD,
  KI_LABEL,
  MARGIN,
  RASTER,
  QUOTE_ALONE_MAX,
  QUOTE_LONG,
  STECKBRIEF,
  TOP_PAD,
} from './sharepicLayoutConstants';
import { slideProvenance } from './sharepicProvenance';
import { sharepicTheme } from './sharepicThemes';
import { drawSlideChrome } from './slideChrome';
import { type BuildPass, type SlideCtx } from './slideContext';
import { slideInk } from './slideInk';
import { fadeIntoGround, steckbriefAround } from './steckbriefCompose';
import { layoutFaktencheck, layoutVergleich } from './vergleichLayout';
import { layoutFrage, layoutZitat } from './zitatLayout';

import type { AdditionalText } from '@ggraphic/editor/configs/types';

export { SHAREPIC_COLOR_HEX, type MeasureText };
export { SCRIM_MAX } from './sharepicGround';
export type { ComposedSharepic, ComposedSlide, ComposeOptions, PhotoTone } from './composeTypes';
export {
  balancedWrap,
  fitStoererText,
  largestSizeWordsFit,
  STOERER_LINE_STEP,
  wrapWords,
} from '@ggraphic/editor/composer/textFit';

/** A photo tinted green, as the posts set people: DE in Klee, AT in its light green. */
const BILD_TINT: Record<SharepicBrandId, string> = {
  'gruene-de': '#008939',
  'gruene-at': '#56AF31',
  'gj-de': '#33C270',
  'gj-at': '#92CE26',
};
/** The editor page each design opens in. */
const TEMPLATE_TYPE = {
  'gruene-de': 'freeform',
  'gruene-at': 'freeform-at',
  'gj-de': 'freeform-gj',
  'gj-at': 'freeform-gj-at',
} as const satisfies Record<SharepicBrandId, ComposedSharepic['templateType']>;
/** Air between the text group and a photo in the slide. */
const BILD_CLEARANCE = 50;
const BILD_KARTE = { inset: 40, share: 0.4, pad: 16 } as const;
/** Diameter of a round photo, as a share of the width. */
const BILD_KREIS = 0.5;
/** A cut-out person rises from the bottom edge to here. */
const BILD_FREI_TOP = 0.4;

/** A brand that sets headlines in capitals: headline, the line above it and a closing call. */
function inCapitals(slide: SharepicSlide): SharepicSlide {
  return {
    ...slide,
    items: slide.items.map((item) =>
      item.type === 'headline'
        ? { ...item, lines: item.lines.map((line) => line.toLocaleUpperCase('de-DE')) }
        : item.type === 'dachzeile' || item.type === 'aufruf'
          ? { ...item, text: item.text.toLocaleUpperCase('de-DE') }
          : item
    ),
  };
}

export function composeSharepic(spec: SharepicSpec, options: ComposeOptions): ComposedSharepic {
  const count = spec.slides.length;
  const format = spec.format ?? DEFAULT_FORMAT_ID;
  const canvas = getCanvasFormatOrDefault(format);
  // Numbered points count only the slides that carry a number.
  let counted = 0;
  const numerals = spec.slides.map((slide) =>
    slide.nummer ? { stil: slide.nummer, k: ++counted } : null
  );
  const brandId = brandIdFor(spec.locale, spec.brand);
  const slides = spec.slides.map((slide, index) =>
    composeSlide(
      slide,
      spec.locale,
      canvas,
      options,
      options.attributions?.[index] ?? null,
      index < count - 1 && spec.pfeil !== false,
      count > 1 && spec.seitenzahl ? { index, count, style: spec.seitenzahl } : null,
      numerals[index] ?? null,
      count > 1 && index === count - 1,
      spec.thema ?? null,
      brandId
    )
  );
  return {
    templateType: TEMPLATE_TYPE[brandId],
    format,
    slides,
    ...(options.provenance
      ? { provenance: spec.slides.map((slide, index) => slideProvenance(slide, slides[index]!)) }
      : {}),
  };
}

function composeSlide(
  slide: SharepicSlide,
  locale: SharepicCreatorLocale,
  canvas: CanvasFormat,
  options: ComposeOptions,
  attribution: SharepicPhotoAttribution | null,
  /** Not the last slide of a carousel (and arrows on): it gets the "swipe on" arrow. */
  swipeOn: boolean,
  /** Where this slide sits in a numbered carousel. */
  page: { index: number; count: number; style: SharepicSeitenzahl } | null,
  /** This slide's point number, counted over the numbered slides. */
  numeral: { stil: SharepicNummer; k: number } | null,
  /** Last slide of a carousel: the AI label in its long form. */
  closing: boolean,
  thema: SharepicThema | null,
  brandId: SharepicBrandId
): ComposedSlide {
  const measure = sentinelBlind(options.measure ?? defaultMeasure);
  const theme = getBrandTheme(locale, brandOfId(brandId));
  const brand = getBrandPack(locale, brandOfId(brandId)).composer;
  // A brand without the marker box highlights with its accent only, so a
  // `++` that reaches its slide is set as `==`.
  const marked = brand.features.markerBox
    ? encodeHandMarks(slide)
    : foldMarkers(encodeHandMarks(slide));
  const spec = brand.headlineCase === 'versal' ? inCapitals(marked) : marked;
  const bg = spec.background;
  const bild =
    bg.kind === 'farbe' ? (spec.items.find((i): i is BildItem => i.type === 'bild') ?? null) : null;
  const bildIndex = bild ? spec.items.indexOf(bild) : -1;
  const steckbrief = spec.items.find((i): i is SteckbriefItem => i.type === 'steckbrief') ?? null;
  /** Where a steckbrief's person stands: the arrows point there. */
  const person = steckbrief ? steckbriefPerson(canvas, bg.kind === 'foto') : null;
  const darkText = brand.darkText;
  const boxed = brand.features.zeilenboxen && !!spec.zeilenboxen;
  const quoteSlide = spec.items.some((i) => i.type === 'zitat');
  const posterQuote = brand.quoteStyle === 'poster' && quoteSlide;
  /** A poster quote on a photo: always centred at the bottom, as the posts set it. */
  const posterPhotoQuote = posterQuote && bg.kind === 'foto';
  /** A headline alone on a colour (cover, hook): top-left, as the posts set it. */
  const headlineAlone =
    bg.kind === 'farbe' &&
    spec.items.some((i) => i.type === 'headline') &&
    spec.items.every((i) => i.type === 'headline' || i.type === 'dachzeile');
  // Text on a full-bleed photo sits at the bottom — the photo stays visible
  // above it. Line boxes are the exception: the posts stack them mid-photo.
  const position = headlineAlone
    ? 'oben'
    : bg.kind === 'foto' && spec.position === 'mitte' && !boxed
      ? 'unten'
      : spec.position;

  const out: ComposedSlide = {
    backgroundMode: bg.kind === 'farbe' ? 'color' : 'image',
    backgroundColor:
      SHAREPIC_COLOR_HEX[
        bg.kind === 'farbe' ? bg.color : bg.kind === 'foto' ? 'dunkeltanne' : bg.panelColor
      ],
    hasBackgroundImage: bg.kind !== 'farbe',
    imageAttribution: bg.kind !== 'farbe' || bild ? attribution : null,
    additionalTexts: [],
    pillBadgeInstances: [],
    circleBadgeInstances: [],
    shapeInstances: [],
    assetInstances: [],
    chartInstances: [],
    userImageInstances: [],
    selectedIcons: [],
    iconStates: {},
    layerOrder: [],
  };
  if (bg.kind !== 'farbe') out.currentImageSrc = options.photoSrc(bg.filename);

  const addShape = (shape: ShapeInstance) => {
    out.shapeInstances.push(shape);
    out.layerOrder.push(shape.id);
  };
  /** An editor icon centred on x/y, `size` px across. */
  const addIcon = (
    id: string,
    iconId: string,
    x: number,
    y: number,
    size: number,
    color: string,
    opacity = 1
  ) => {
    out.selectedIcons.push(id);
    out.iconStates[id] = { iconId, x, y, scale: size / 120, rotation: 0, color, opacity };
    out.layerOrder.push(id);
  };
  const rect = (id: string, x: number, y: number, w: number, h: number, fill: string) => {
    const shape = createShape('rect', x + w / 2, y + h / 2, fill, fill);
    return Object.assign(shape, { id, width: w, height: h });
  };

  // ── Surface: what the text sits on, and the planes that make it ──────────
  let areaTop = 0;
  let areaBottom: number = canvas.height;
  let surface: SharepicColor | 'foto' = 'foto';
  let scrim: ShapeInstance | null = null;
  let scrimSide: 'unten' | 'oben' | null = null;
  let scrimDark = '';
  let scrimLevel = 0;
  /**
   * Places the scrim: dense (`scrimLevel` and up) from the text side's edge
   * to `denseTo` px inward, then a fade to nothing.
   */
  const setScrim = (side: SharepicTextSide, denseTo: number) => {
    if (!scrim) return;
    Object.assign(
      scrim,
      scrimFill({
        side,
        denseTo,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        level: scrimLevel,
        darkRgb: scrimDark,
      })
    );
  };
  /** The colour beside a photo strip: flat, except Hellgrün, which keeps its glow. */
  const panel = (y: number, height: number, color: SharepicColor) => {
    const shape = rect('sc-panel', 0, y, canvas.width, height, SHAREPIC_COLOR_HEX[color]);
    const glow = GRADIENTS[color];
    if (glow?.type === 'radial') {
      shape.fillGradient = { type: 'radial', angle: 0, stops: evenStops(glow.stops) };
    }
    return shape;
  };
  const aufruf = spec.items.find((i) => i.type === 'aufruf') ?? null;
  let column: Column = {
    x: MARGIN,
    width: canvas.width - 2 * MARGIN,
    align:
      posterQuote || (aufruf && aufruf.stil !== 'ausruf')
        ? 'center'
        : headlineAlone
          ? 'left'
          : spec.align === 'zentriert'
            ? 'center'
            : 'left',
  };

  /** Header band: the text above the card stands on it; the card on `bg.color`. */
  const kopfband = brand.features.kopfband && bg.kind === 'farbe' ? (bg.kopfband ?? null) : null;
  if (bg.kind === 'farbe') {
    surface = kopfband ?? bg.color;
    const gradient = GRADIENTS[bg.color];
    if (gradient) {
      const { stops } = gradient;
      const bgPlane = rect('sc-bg', 0, 0, canvas.width, canvas.height, stops[1]!);
      bgPlane.fillGradient = {
        type: gradient.type ?? 'linear',
        angle: gradient.angle,
        stops: evenStops(stops),
      };
      addShape(bgPlane);
    }
  } else if (bg.kind === 'foto-oben') {
    surface = bg.panelColor;
    // The event template's strip share (40 %), on whatever height the format has.
    areaTop =
      (VERANSTALTUNG_CONFIG.photo.height * canvas.height) / VERANSTALTUNG_CONFIG.canvas.height;
    // The photo is cover-fitted to the whole canvas; move its middle into the strip.
    out.imageOffset = { x: 0, y: areaTop / 2 - canvas.height / 2 };
    out.imageScale = 1;
    addShape(panel(areaTop, canvas.height - areaTop, bg.panelColor));
  } else if (bg.kind === 'foto-unten') {
    // The colour carries the text at the top; the photo starts at a hard edge
    // (a soft fade reads as a smear on AT, and the posts cut it clean).
    surface = bg.panelColor;
    areaBottom = canvas.height * 0.6;
    // The lower strip, from where the text area ends: the photo's middle goes there.
    out.imageOffset = { x: 0, y: (areaBottom + canvas.height) / 2 - canvas.height / 2 };
    out.imageScale = 1;
    addShape(panel(0, areaBottom, bg.panelColor));
  } else if (!boxed || spec.items.some((i) => i.type === 'zitat' || i.type === 'frage')) {
    // Text on a photo: a gradient from the text side into the picture.
    // Line boxes bring their own contrast and need none — a quote or question
    // stays free text even on a boxed slide, so it needs the scrim.
    const side = posterPhotoQuote ? 'unten' : bg.textSeite;
    const vertical = side === 'unten' || side === 'oben';
    scrimDark = SCRIM_DARK[brandId];
    scrimLevel = SCRIM_TEXT_ALPHA[options.photoTone?.(bg.filename, side) ?? 'mittel'];
    // Real stops follow in `setScrim`, once the geometry is known.
    scrim = rect('sc-scrim', 0, 0, canvas.width, canvas.height, 'transparent');
    addShape(scrim);
    if (vertical) {
      // Sized after layout, once the block's height is known.
      scrimSide = side;
    } else {
      const width = canvas.width * 0.52;
      column = {
        x: side === 'links' ? MARGIN : canvas.width - MARGIN - width,
        width,
        align: 'left',
      };
      // Dense across the column and a gutter, from the picture's edge outward.
      setScrim(side, MARGIN + width + SCRIM_GUTTER);
    }
  }
  // A steckbrief on its photo: only the top traits stand on the sky; the rest
  // of the portrait stays as shot, the text carries a shadow.
  if (steckbrief && scrim) {
    scrimSide = null;
    scrimLevel = Math.min(scrimLevel, STECKBRIEF.scrimMax);
    setScrim('oben', canvas.height * STECKBRIEF.scrimTop);
  }
  // AT sets a photo strip in green monochrome, as the posts do; a full-bleed
  // photo carries the text and stays as shot.
  // A themed slide keeps its photo's colours: a green Pride flag says nothing.
  if (
    brand.layout.tintPhotoStrip &&
    !sharepicTheme(thema)?.keepsPhotoColours &&
    (bg.kind === 'foto-oben' || bg.kind === 'foto-unten')
  ) {
    const top = bg.kind === 'foto-oben' ? 0 : areaBottom;
    const bottom = bg.kind === 'foto-oben' ? areaTop : canvas.height;
    const tint = rect('sc-tint', 0, top, canvas.width, bottom - top, theme.colors.primary);
    addShape({ ...tint, blendMode: 'color' });
  }

  const {
    onLight,
    darkInk,
    onGrass,
    textColor,
    footerOnLight,
    footerDarkInk,
    shadow,
    accent,
    marker,
    accentLineBox,
    badgeColors,
    cardAccent,
    accentInk,
    contrastPanel,
    footerGround,
    topGround,
  } = slideInk({
    locale,
    theme,
    brand,
    brandId,
    surface,
    darkText,
    kopfband,
    bg,
    bild,
    thema,
  });
  /** The widest size `value` can take on one line of `width`, up to `cap`. */
  const fitLine = (value: string, cap: number, width: number, family: string) =>
    Math.max(
      24,
      Math.min(cap, Math.floor((cap * width) / Math.max(1, measure(value, cap, family, 'bold'))))
    );
  /** Lines a rich text takes — the same layout the editor's renderer runs. */
  const layoutLines = (
    value: string,
    width: number,
    size: number,
    family: string,
    weight: NonNullable<TextAccent['fontStyle']>,
    runAccent: TextAccent = accent
  ) => layoutTextLines(measure, value, width, size, family, weight, runAccent);
  const lineCount = (...args: Parameters<typeof layoutLines>) => layoutLines(...args).length;

  // Date circle: free in the bottom-right corner, as on the posts; the text
  // group ends above it and the place sits beside it. Under a photo strip the
  // panel is too short for that: the column runs beside the circle instead
  // and the place stacks bottom-left.
  // GJ AT sets the date as a label in the top corner and the place on a
  // footer band (DehRgj4jAe9/01): no circle to keep free.
  const etikett = !!spec.datum && brand.layout.datumCircle === 'etikett';
  const circle =
    spec.datum && !etikett
      ? {
          x: canvas.width - DATE_CIRCLE.right - DATE_CIRCLE.radius,
          y: canvas.height - DATE_CIRCLE.bottom - DATE_CIRCLE.radius,
          radius: DATE_CIRCLE.radius,
        }
      : null;
  const columnBesideCircle = !!circle && bg.kind === 'foto-oben';
  if (circle && columnBesideCircle) {
    column = { ...column, width: circle.x - circle.radius - GAP - column.x };
  } else if (circle) {
    areaBottom = Math.min(areaBottom, circle.y - circle.radius - GAP);
  }

  // The headline keeps the full column; AT argument slides set centred
  // paragraphs narrower (~100 px side margins on the posts).
  const headColumn = column;
  const centredMargin = brand.layout.centredMargin;
  if (centredMargin !== null && column.align === 'center' && surface !== 'foto') {
    const width = canvas.width - 2 * centredMargin;
    column = { ...column, x: centredMargin, width };
  }
  const xAlign = column.align;

  // Logo: AT only on the last slide, only on a plain colour and never on a
  // quote (2 of 42 posts carry it, both so); DE never on a full-bleed photo. Enforced here — the
  // model sets `logo: true` far more often than the posts do.
  // The key sentence closes over the logo, as the posts end.
  const placement = brand.layout.logoPlacement;
  const showLogo =
    placement !== 'none' &&
    (spec.logo || aufruf?.stil === 'kernsatz') &&
    (placement === 'closing' ? !swipeOn && bg.kind === 'farbe' && !quoteSlide : bg.kind !== 'foto');
  const logo = brand.logo;
  /** DE always and AT next to a date circle set the logo bottom-left, at the margin. */
  const logoLeft = showLogo && (placement === 'left' || !!spec.datum);
  const logoCentred = showLogo && !logoLeft;
  const arrow = ARROW[brandId];
  const arrowLeft = canvas.width - arrow.right - arrow.size * arrow.glyph;
  /** Where place and source start: right of a bottom-left logo. */
  const footX = logoLeft ? MARGIN + logo.size + 24 : MARGIN;

  // Footer row: logo, arrow, place, source — the text group ends above it.
  const ortBesideCircle = !!spec.ort && !!circle && !columnBesideCircle;
  // Beside the circle under a photo strip the place ends the column, right
  // under the text as on the event posters (S.23, S.26) — in the footer it
  // stood beside the logo, away from the date.
  const ortInColumn = !!spec.ort && columnBesideCircle;
  const ortInFooter = !!spec.ort && !ortBesideCircle && !ortInColumn;
  const footerUsed = showLogo || swipeOn || ortInFooter || !!spec.quelle;
  if (footerUsed) {
    areaBottom = Math.min(
      areaBottom,
      canvas.height - FOOTER - (ortInFooter ? spec.ort!.lines.length * 48 : 0)
    );
  }
  // A large logo reaches above the footer row; the text stays clear of it.
  if (showLogo) areaBottom = Math.min(areaBottom, canvas.height - logo.bottom - logo.height - 20);

  // The AI label owns the bottom-left corner; place/source stack above it.
  const kiText =
    options.kiLabel === false ? null : closing ? KI_LABEL.texts.closing : KI_LABEL.texts.slide;
  const kiHeight = KI_LABEL.fontSize + 2 * KI_LABEL.paddingY;
  const kiTop = canvas.height - kiHeight - KI_LABEL.margin;
  const quelleSize = 24;
  // A centred logo owns the middle of the footer, the arrow the right: the
  // source wraps left of both.
  // The teaser beside the arrow, in the body face; the source wraps left of it.
  const weiter = swipeOn && spec.weiter ? spec.weiter : null;
  const weiterRight = arrowLeft - 14;
  // It shares the bottom row with the AI label: smaller type before it reaches the label.
  const weiterLeft = kiText
    ? KI_LABEL.margin +
      measure(kiText, KI_LABEL.fontSize, KI_LABEL.fontFamily, 'bold') +
      2 * KI_LABEL.paddingX +
      24
    : MARGIN;
  const weiterBase = brand.fontSize.weiter;
  const weiterSize = weiter
    ? Math.max(
        20,
        Math.min(
          weiterBase,
          Math.floor(
            (weiterBase * (weiterRight - weiterLeft)) /
              measure(weiter, weiterBase, theme.fonts.body, 'bold')
          )
        )
      )
    : weiterBase;
  // Still too long at the smallest size: it wraps and grows upward.
  const weiterLines = weiter
    ? wrapWords(weiter, weiterRight - weiterLeft, (l) =>
        measure(l, weiterSize, theme.fonts.body, 'bold')
      )
    : [];
  const weiterWidth = Math.max(
    0,
    ...weiterLines.map((l) => measure(l, weiterSize, theme.fonts.body, 'bold'))
  );
  const quelleRight = Math.min(
    logoCentred && !spec.ort ? canvas.width / 2 - logo.size / 2 - 20 : canvas.width - MARGIN - 190,
    swipeOn ? arrowLeft - 20 : canvas.width,
    weiter ? weiterRight - weiterWidth - 24 : canvas.width
  );
  const quelleWidth = quelleRight - footX;
  const quelleText = spec.quelle ? `Quelle: ${spec.quelle.replace(/^Quelle:\s*/i, '')}` : '';
  // The block's bottom sits just above the label, however many lines it wraps to.
  const quelleLines = spec.quelle
    ? wrapWords(quelleText, quelleWidth, (l) => measure(l, quelleSize, theme.fonts.body, 'normal'))
        .length
    : 0;
  const quelleY = kiText
    ? kiTop - KI_LABEL.gap - Math.max(1, quelleLines) * quelleSize * 1.2
    : canvas.height - 44;
  const ortBottom = kiText
    ? spec.quelle
      ? quelleY
      : kiTop - KI_LABEL.gap
    : canvas.height - FOOTER / 2 + 20;
  // The text group stops above the source, whatever its line count, and
  // never closer to the AI label than the gap between them.
  if (spec.quelle) areaBottom = Math.min(areaBottom, quelleY - 20);
  else if (kiText) areaBottom = Math.min(areaBottom, kiTop - KI_LABEL.gap - 20 + MARGIN);

  // ── A photo in the slide: a fixed place per ausschnitt, the text keeps clear ──
  if (bild) {
    const id = `sc-${bildIndex}-bild`;
    const textBottom = areaBottom - MARGIN;
    const photo = (x: number, y: number, width: number, height: number) => {
      out.userImageInstances.push({
        id,
        src: options.photoSrc(
          bild.ausschnitt === 'freigestellt' ? (bild.freisteller ?? bild.quelle) : bild.quelle
        ),
        fileName: bild.quelle,
        x,
        y,
        width,
        height,
        rotation: 0,
        scale: 1,
        opacity: 1,
        fit: 'cover',
        ...(bild.ausschnitt === 'kreis' && { mask: 'kreis' as const }),
        ...(bild.filter === 'gruen' && { tint: BILD_TINT[brandId], tintStrength: 1 }),
        ...(bild.filter === 'grau' && { grayscale: true }),
      });
      out.layerOrder.push(id);
    };
    switch (bild.ausschnitt) {
      case 'streifen-unten': {
        const top = Math.round((canvas.height * 2) / 3);
        photo(0, top, canvas.width, canvas.height - top);
        areaBottom = Math.min(areaBottom, top + MARGIN - BILD_CLEARANCE);
        break;
      }
      case 'streifen-oben': {
        const bottom = Math.round(canvas.height / 3);
        photo(0, 0, canvas.width, bottom);
        areaTop = Math.max(areaTop, bottom);
        break;
      }
      case 'karte': {
        const width = canvas.width - 2 * MARGIN - 2 * BILD_KARTE.inset;
        const height = Math.round(canvas.height * BILD_KARTE.share);
        const x = (canvas.width - width) / 2;
        const y = textBottom - height;
        const card = rect(`${id}-karte`, x, y, width, height, '#FFFFFF');
        addShape(
          Object.assign(card, {
            shadowColor: '#000000',
            shadowBlur: 24,
            shadowOffsetY: 6,
            shadowOpacity: 0.18,
          })
        );
        const pad = BILD_KARTE.pad;
        photo(x + pad, y + pad, width - 2 * pad, height - 2 * pad);
        areaBottom = Math.min(areaBottom, y + MARGIN - BILD_CLEARANCE);
        break;
      }
      case 'kreis': {
        const size = Math.round(canvas.width * BILD_KREIS);
        const y = textBottom - size;
        photo((canvas.width - size) / 2, y, size, size);
        areaBottom = Math.min(areaBottom, y + MARGIN - BILD_CLEARANCE);
        break;
      }
      case 'freigestellt': {
        if (person) {
          // A steckbrief: the person in the middle, the traits around them.
          photo(person.x, person.y, person.width, person.height);
          // The portrait is cut at the shoulders: its sides melt into the ground,
          // and a photo with its own background its top as well.
          if (bg.kind === 'farbe')
            fadeIntoGround({ canvas, rect, addShape }, person, bg.color, !bild.freisteller);
          break;
        }
        // The person stands on the bottom edge; the footer lies over them.
        const top = Math.round(canvas.height * BILD_FREI_TOP);
        photo(0, top, canvas.width, canvas.height - top);
        areaBottom = Math.min(areaBottom, top + MARGIN);
        break;
      }
    }
  }

  // ── The text group ───────────────────────────────────────────────────────
  const text = (
    id: string,
    value: string,
    y: number,
    fontSize: number,
    fontFamily: string,
    extra: Partial<AdditionalText> = {}
  ) => {
    out.additionalTexts.push({
      id,
      text: value,
      type: 'body',
      x: column.x,
      y,
      width: column.width,
      fontSize,
      fontFamily,
      fontStyle: 'normal',
      fill: textColor,
      align: xAlign,
      accent,
      ...(marker ? { marker } : {}),
      ...shadow,
      ...extra,
    });
    out.layerOrder.push(id);
  };

  /**
   * DE story slides: every line in its own box — white, or grass green for
   * the line that matters. Pills, so a box follows its text when edited.
   */
  const boxLines = (
    id: string,
    lines: { text: string; betont: boolean }[],
    size: number,
    family: string,
    fontStyle: 'normal' | 'bold'
  ): Placed => {
    // Measured on Dd9G7lMjMIz: tight padding, round corners, the boxes touching.
    const padX = Math.round(size * 0.25);
    const padY = Math.round(size * 0.08);
    const step = size + 2 * padY;
    return {
      height: lines.length * step,
      after: Math.round(size * 0.5),
      place: (y) => {
        lines.forEach((line, k) => {
          const lineId = `${id}-${k}`;
          const width = measure(line.text, size, family, fontStyle) + 2 * padX;
          // GJ: the first line on white, the rest on light green, square bars (CD 2024 S. 19).
          // On a plain colour GJ DE turns them black with white type (Dap3RgnDDrV/01).
          const own = brand.lineBoxes
            ? bg.kind === 'farbe' &&
              brand.lineBoxes.onColour &&
              brand.lineBoxes.onColour.fill !== out.backgroundColor
              ? brand.lineBoxes.onColour
              : k === 0 && !line.betont
                ? brand.lineBoxes.first
                : brand.lineBoxes.rest
            : null;
          out.pillBadgeInstances.push(
            createPillBadgeInstance('slider', {
              id: lineId,
              text: line.text,
              x: xAlign === 'center' ? column.x + column.width / 2 - width / 2 : column.x,
              y: y + k * step,
              fontSize: size,
              fontFamily: family,
              fontStyle,
              backgroundColor:
                own?.fill ?? (line.betont ? SHAREPIC_COLOR_HEX.grasgruen : '#FFFFFF'),
              textColor: own?.ink ?? BOX_INK,
              paddingX: padX,
              paddingY: padY,
              cornerRadius: own ? 0 : Math.round(size * 0.2),
            })
          );
          out.layerOrder.push(lineId);
        });
      },
    };
  };
  // The posts run a box line up to ~90 % of the width, balanced.
  const wrapBoxed = (value: string, size: number, family: string, fontStyle: 'normal' | 'bold') =>
    balancedWrap(stripMarks(value), column.width * 0.92 - size * 0.5, (l) =>
      measure(l, size, family, fontStyle)
    );

  // ── Headline size: fills its column, shrinks only when the block would not fit ──
  const headFamily = theme.fonts.headline;
  const { growCover, headlineSizer } = headlineFit({
    measure,
    emphasis: brand.accent.emphasis,
    theme,
    columnWidth: headColumn.width,
    canvasHeight: canvas.height,
  });
  // Next to a card (list, chart, comparison) or an icon list the headline is
  // a title, not the hero: the explainer posts set it at ~100–130 px.
  const withCard = spec.items.some((i) => CARD_ITEMS.includes(i.type));
  const gross = (i: SharepicItem) => i.type === 'headline' && i.groesse === 'gross';
  const headMax =
    (headlineAlone ? HEADLINE_COVER_MAX : withCard ? HEADLINE_WITH_CARD : HEADLINE_MAX) *
    (spec.items.some(gross) ? HEADLINE_GROSS : 1);
  // A larger headline mostly needs shorter lines: its width, not the cap, sets the size.
  const items =
    headlineAlone || spec.items.some(gross)
      ? spec.items.map((i) => (i.type === 'headline' ? growCover(i, headMax) : i))
      : spec.items;
  const headItem = items.find((i) => i.type === 'headline') ?? null;
  const headAccented = headItem?.type === 'headline' ? accentLines(headItem.akzent) : [];
  const headlineSizeAt = headlineSizer({ headItem, headAccented, headMax, boxed });

  /**
   * A quote alone on a colour is the slide's hero, like a headline: it fills
   * ~25–30 % of the height (interview covers), not a caption-sized card.
   */
  const quoteAlone =
    bg.kind === 'farbe' &&
    items.some((i) => i.type === 'zitat') &&
    items.every((i) => i.type === 'zitat' || i.type === 'dachzeile') &&
    // A card quote that runs long is a text page, set at body size.
    (brand.quoteStyle !== 'card' ||
      !items.some((i) => i.type === 'zitat' && stripMarks(i.text).length > QUOTE_LONG));
  const quoteSize = (base: number, scale: number, cap: number) =>
    quoteAlone
      ? Math.min(Math.round(base * scale * 1.6), QUOTE_ALONE_MAX)
      : Math.min(Math.round(base * Math.min(scale, 1.5)), cap);

  /** Logo position when a layout moves it off the bottom-left corner. */
  /** A layout that moves the logo off the corner; it then stands on grass green. */
  const logoAt: { current: { x: number } | null } = { current: null };

  // A hook: one short paragraph alone on the slide.
  const only = items.length === 1 ? items[0] : null;
  const shortHook = only?.type === 'absatz' && only.text.split(/\s+/).length <= 10;
  const paraBase = brand.fontSize.absatz;
  const ctx: SlideCtx = {
    measure,
    theme,
    brand,
    headFamily,
    locale,
    brandId,
    thema,
    canvas,
    options,
    out,
    column,
    xAlign,
    darkText,
    onLight,
    darkInk,
    onGrass,
    textColor,
    accent,
    accentInk,
    badgeColors,
    cardAccent,
    contrastPanel,
    logoAt,
    addShape,
    addIcon,
    rect,
    text,
    lineCount,
    fitLine,
    quoteAlone,
    quoteSize,
    paraBase,
  };
  /**
   * The group at a paragraph scale; side-effect free until `place`. A chart
   * gives up `chartShrink` px of its height before any text shrinks.
   */
  const build = (scale: number, chartShrink = 0, headScale = 1): Placed[] => {
    const placed: Placed[] = [];
    const headSize = headlineSizeAt(headScale);
    /** Paragraphs never come closer than 1 : 1.8 to the headline. */
    const paraCap = headSize ? Math.floor(headSize / HEADLINE_RATIO) : Number.POSITIVE_INFINITY;
    const pass: BuildPass = { scale, paraCap, chartShrink };
    if (numeral?.stil === 'gross') {
      // "2." above the point, in the accent, at about a third of the width.
      const size = Math.round(Math.min(canvas.width * 0.33, 360) * Math.min(1, scale));
      placed.push({
        height: size * 0.8,
        after: Math.round(size * 0.12),
        place: (y) =>
          text('sc-nummer', `${numeral.k}.`, y - size * 0.12, size, headFamily, {
            x: headColumn.x,
            width: headColumn.width,
            fill: accentInk,
            lineHeight: 1,
            type: 'header',
          }),
      });
    }
    items.forEach((item: SharepicItem, index) => {
      const id = `sc-${index}-${item.type}`;
      switch (item.type) {
        case 'dachzeile': {
          // Scales with the headline (≈ 0.4 on the photo posts, in the
          // headline face; smaller and in bold body text on a colour).
          const onPhoto = surface === 'foto';
          const family = onPhoto ? headFamily : theme.fonts.body;
          const fontStyle = onPhoto ? 'normal' : 'bold';
          const size = largestSizeWordsFit(
            [item.text],
            headSize ? Math.round(headSize * (onPhoto ? 0.4 : 0.3)) : 38,
            headColumn.width,
            0,
            (w, s) => measure(w, s, family, 'bold')
          );
          const lineHeight = onPhoto ? 1 : 1.15;
          const lines = lineCount(item.text, headColumn.width, size, family, fontStyle);
          placed.push({
            height: lines * size * lineHeight,
            after: Math.round(size * 0.15),
            place: (y) =>
              text(id, item.text, y, size, family, {
                fontStyle,
                lineHeight,
                x: headColumn.x,
                width: headColumn.width,
              }),
          });
          break;
        }
        case 'headline': {
          if (boxed) {
            placed.push(
              boxLines(
                id,
                item.lines.map((l, i) => ({
                  text: stripMarks(l),
                  betont: accentLines(item.akzent).includes(i),
                })),
                76,
                brand.lineBoxes ? headFamily : theme.fonts.body,
                brand.lineBoxes ? 'normal' : 'bold'
              )
            );
            break;
          }
          const family = headFamily;
          const lineHeight = brand.lineHeight.headline;
          const size = headSize ?? 72;
          const step = size * lineHeight;
          const col = headColumn;
          const centre = col.x + col.width / 2;
          // Consecutive plain lines share one text element; the accent line is its own.
          const segments: { lines: string[]; accent: boolean }[] = [];
          item.lines.forEach((l, i) => {
            const accent = headAccented.includes(i);
            const last = segments[segments.length - 1];
            if (last && !last.accent && !accent) last.lines.push(l);
            else segments.push({ lines: [l], accent });
          });
          // A line wider than the column still wraps at a small size: count the rows set.
          const rows = (lines: string[], accent: boolean) =>
            lines.reduce(
              (n, l) =>
                n +
                Math.max(
                  1,
                  accent && brand.accent.emphasis
                    ? wrapWords(stripMarks(l), col.width, (t) =>
                        measure(
                          t,
                          Math.round(size * 0.95),
                          theme.fonts.quoteEmphasis,
                          AT_EMPHASIS_STYLE
                        )
                      ).length
                    : lineCount(l, col.width, size, family, 'normal')
                ),
              0
            );
          const height = segments.reduce((h, seg) => h + rows(seg.lines, seg.accent) * step, 0);
          placed.push({
            height,
            after: Math.round(size * 0.35),
            place: (y) => {
              let cursor = y;
              segments.forEach((segment, s) => {
                const segId = `${id}-${s}`;
                const value = segment.lines.join('\n');
                const at = { x: col.x, width: col.width };
                // An accent line is one accent already; a word accent inside it
                // would vanish (DE: lime on lime) — keep the plain words.
                const plain = stripMarks(value);
                if (segment.accent && brand.accent.emphasis) {
                  text(segId, plain, cursor, Math.round(size * 0.95), theme.fonts.quoteEmphasis, {
                    ...at,
                    fontStyle: AT_EMPHASIS_STYLE,
                    fill: accent.fill,
                    lineHeight,
                    type: 'header',
                  });
                } else if (segment.accent) {
                  // DE marker: dark text on a box sized to the line, centred on
                  // the line's own column (not the canvas — a date circle or a
                  // side photo narrows it).
                  const w = measure(plain, size, family, 'normal') + size * 0.4;
                  const x = xAlign === 'center' ? centre - w / 2 : col.x - size * 0.15;
                  const box = rect(
                    `${segId}-box`,
                    x,
                    cursor + size * 0.04,
                    w,
                    step,
                    accentLineBox.fill
                  );
                  box.rotation = -2;
                  addShape(box);
                  text(segId, plain, cursor, size, family, {
                    ...at,
                    fill: accentLineBox.ink,
                    lineHeight,
                    type: 'header',
                    shadowOpacity: 0,
                  });
                } else {
                  text(segId, value, cursor, size, family, { ...at, lineHeight, type: 'header' });
                }
                cursor += rows(segment.lines, segment.accent) * step;
              });
            },
          });
          break;
        }
        case 'text': {
          if (boxed) {
            const size = 42;
            const lines = wrapBoxed(item.text, size, theme.fonts.body, 'normal');
            placed.push(
              boxLines(
                id,
                lines.map((l) => ({ text: l, betont: false })),
                size,
                theme.fonts.body,
                'normal'
              )
            );
            break;
          }
          // Grows with the fit loop, capped so a one-liner doesn't turn into a headline.
          let size = largestSizeWordsFit(
            [item.text],
            Math.min(Math.round(42 * Math.min(scale, 1.4)), paraCap),
            column.width,
            0,
            (w, s) => measure(w, s, theme.fonts.body, 'bold')
          );
          // A last line of a single word or emoji reads as a slip: a little
          // smaller, if that pulls it up to the line above.
          const widowed = (s: number) => {
            const rows = layoutLines(item.text, column.width, s, theme.fonts.body, 'normal');
            const last =
              rows
                .at(-1)
                ?.runs.map((r) => r.text)
                .join('')
                .trim() ?? '';
            return rows.length > 1 && !/\s/.test(last);
          };
          if (brand.features.widowGuard && widowed(size)) {
            for (let s = size - 2; s >= size * 0.85; s -= 2) {
              if (!widowed(s)) {
                size = s;
                break;
              }
            }
          }
          const lines = lineCount(item.text, column.width, size, theme.fonts.body, 'normal');
          placed.push({
            height: lines * size * 1.25,
            after: GAP,
            place: (y) => text(id, item.text, y, size, theme.fonts.body, { lineHeight: 1.25 }),
          });
          break;
        }
        case 'absatz': {
          // A story paragraph: larger than `text`. AT sets it in the headline
          // face, a stressed one in yellow Vollkorn; DE in regular body text
          // with `**…**` for the key words (design guide p. 14, the posts).
          if (boxed) {
            // Boxes grow less: a box per line must stay a phrase, not a word —
            // except on a short hook, which the posts set large.
            // ~4.6 % of the width on the story slides, ~8 % on a hook (Dd9G7lMjMIz).
            const size = Math.round(50 * Math.min(scale, shortHook ? 1.75 : 1.05));
            const lines = wrapBoxed(item.text, size, theme.fonts.body, 'bold');
            placed.push(
              boxLines(
                id,
                lines.map((l) => ({ text: l, betont: !!item.betont })),
                size,
                theme.fonts.body,
                'bold'
              )
            );
            break;
          }
          // `klein`: body size whatever the room — a closing line, a long text page.
          const wantedSize = item.klein
            ? ABSATZ_KLEIN
            : Math.min(Math.round(paraBase * scale), paraCap);
          const lineHeight = brand.lineHeight.absatz;
          const stressed = item.betont
            ? brand.accent.emphasis
              ? {
                  family: theme.fonts.quoteEmphasis,
                  fontStyle: AT_EMPHASIS_STYLE,
                  fill: accent.fill,
                }
              : { family: theme.fonts.body, fontStyle: 'bold' as const, fill: accent.fill }
            : null;
          const family =
            stressed?.family ??
            (brand.headlineFace.absatz ? theme.fonts.headline : theme.fonts.body);
          const fontStyle = stressed?.fontStyle ?? 'normal';
          // GJ AT: light green on its dark grounds, where it reads at 4.5:1.
          const ownInk =
            !stressed && brand.absatzOnDark && bg.kind === 'farbe' && !onLight
              ? readsOn(brand.absatzOnDark, out.backgroundColor)
              : null;
          const size = largestSizeWordsFit([item.text], wantedSize, column.width, 0, (w, s) =>
            measure(w, s, family, 'bold')
          );
          const lines = lineCount(item.text, column.width, size, family, fontStyle);
          placed.push({
            height: lines * size * lineHeight,
            after: Math.round(size * brand.absatzGap),
            place: (y) =>
              text(id, item.text, y, size, family, {
                fontStyle,
                lineHeight,
                ...(stressed ? { fill: stressed.fill } : {}),
                ...(ownInk ? { fill: ownInk } : {}),
              }),
          });
          break;
        }
        case 'zitat': {
          placed.push(...layoutZitat(ctx, item, id, pass));
          break;
        }
        case 'frage': {
          placed.push(...layoutFrage(ctx, item, id, pass));
          break;
        }
        case 'liste': {
          placed.push(...layoutListe(ctx, item, id, pass));
          break;
        }
        case 'diagramm': {
          placed.push(...layoutDiagramm(ctx, item, id, pass));
          break;
        }
        case 'iconliste': {
          placed.push(...layoutIconliste(ctx, item, id, pass));
          break;
        }
        case 'infografik': {
          placed.push(...layoutInfografik(ctx, item, id, pass));
          break;
        }
        case 'vergleich': {
          placed.push(...layoutVergleich(ctx, item, id, pass));
          break;
        }
        case 'faktencheck': {
          placed.push(...layoutFaktencheck(ctx, item, id, pass));
          break;
        }
        case 'zahl': {
          placed.push(...layoutZahl(ctx, item, id, pass));
          break;
        }
        case 'rechnung': {
          placed.push(...layoutRechnung(ctx, item, id, pass));
          break;
        }
        case 'termine': {
          placed.push(...layoutTermine(ctx, item, id, pass));
          break;
        }
        case 'schlagzeile': {
          placed.push(...layoutSchlagzeile(ctx, item, id, pass));
          break;
        }
        case 'bingo': {
          placed.push(...layoutBingo(ctx, item, id));
          break;
        }
        case 'aufruf': {
          placed.push(...layoutAufruf(ctx, item, id, pass));
          break;
        }
        // Placed before the text group, in its own reserved area.
        case 'bild':
          break;
        // Takes the slide alone (schema): it draws round the person, not in the column.
        case 'steckbrief':
          placed.push({
            height: 0,
            after: 0,
            place: () =>
              steckbriefAround(
                ctx,
                { person, bg, bild, surface, swipeOn, kiText, kiTop, kiHeight },
                id,
                item
              ),
          });
          break;
        case 'button': {
          const size = 44;
          const colors = onGround(brand.button, { onLight, onGrass });
          const pill = createPillBadgeInstance('slider', {
            id,
            text: item.text,
            fontSize: size,
            fontFamily: theme.fonts.headline,
            backgroundColor: colors.fill,
            textColor: colors.ink,
            paddingX: 36,
            paddingY: 18,
            cornerRadius: 60,
          });
          const height = size + 2 * pill.paddingY;
          const width =
            measure(item.text, size, theme.fonts.headline, 'normal') + 2 * pill.paddingX;
          placed.push({
            height,
            after: GAP,
            place: (y) => {
              const x = xAlign === 'center' ? column.x + column.width / 2 - width / 2 : column.x;
              out.pillBadgeInstances.push({ ...pill, x, y });
              out.layerOrder.push(id);
            },
          });
          break;
        }
      }
    });
    if (ortInColumn) {
      const ort = spec.ort!;
      const size = 38;
      placed.push({
        height: ort.lines.length * size * 1.25,
        after: 0,
        place: (y) =>
          text('sc-ort', ort.lines.join('\n'), y, size, theme.fonts.body, { lineHeight: 1.25 }),
      });
    }
    return placed;
  };

  const heightOf = (group: Placed[]) =>
    group.reduce((sum, p) => sum + p.height + p.after, 0) - (group[group.length - 1]?.after ?? 0);
  // A centred block would rise into the top corner of a fitted Störer: keep
  // at least its smallest circle free (a bottom block reaches it only when full).
  const stoererCorner =
    spec.stoerer && position === 'mitte' && brand.stoerer.size === 'fit'
      ? areaTop + MARGIN + 2 * STOERER_RADII.at(-1)! - 30 + GAP
      : 0;
  const top = Math.max(
    (areaTop === 0 ? TOP_PAD[brandId] : areaTop + MARGIN) +
      (spec.stoerer && position === 'oben' ? 40 : 0) +
      (etikett ? ETIKETT_ROOM : 0),
    stoererCorner
  );
  const bottom = areaBottom - MARGIN;
  // Story and argument slides fill the frame like the posts do (measured:
  // the block takes 60–70 % of the height on a colour): paragraphs grow until
  // it reaches the target share of the free height.
  const room = bottom - top;
  const target = quoteAlone
    ? 0.55
    : boxed
      ? 0.4
      : bg.kind === 'foto-unten'
        ? 0.92
        : bg.kind === 'foto'
          ? 0.55
          : 0.85;
  let placed: Placed[] | null = null;
  // Fine steps: coarse ones drop a size too far when one step just misses.
  for (let scale = 1.8; scale > 1 && !placed; scale -= 0.05) {
    const group = build(scale);
    if (heightOf(group) <= room * target) placed = group;
  }
  // Too tall at the base scale: a chart gives up height first, then the
  // headline, then the rest.
  const chartShrink = spec.items.some((i) => i.type === 'diagramm')
    ? Math.max(0, heightOf(build(1)) - room)
    : 0;
  for (let headScale = 1; headScale >= 0.6 && !placed; headScale -= 0.05) {
    const group = build(1, chartShrink, headScale);
    if (heightOf(group) <= room) placed = group;
  }
  for (let scale = 0.95; scale >= 0.6 && !placed; scale -= 0.05) {
    const group = build(scale, chartShrink, 0.6);
    if (heightOf(group) <= room) placed = group;
  }
  placed ??= build(0.6, chartShrink, 0.6);
  const total = heightOf(placed);
  // A block on a plain colour slide sits in the middle, not pinned to the top
  // margin (AT always, DE when short); `unten` stays (logo/arrow layouts are
  // built around it), and a headline alone stays at the top.
  const centred =
    bg.kind === 'farbe' &&
    position !== 'unten' &&
    !headlineAlone &&
    (brand.layout.centreShortBlocks || total < (bottom - top) * 0.5);
  let y =
    position === 'oben' && !centred
      ? top
      : position === 'unten'
        ? Math.max(top, bottom - total)
        : Math.max(top, (top + bottom) / 2 - total / 2);
  const blockTop = y;
  if (numeral?.stil === 'geist') {
    // A pale numeral behind the text, ~60 % of the height, drawn first so the text sits on it.
    const size = Math.round(canvas.height * 0.6);
    out.additionalTexts.push({
      id: 'sc-nummer',
      text: `${numeral.k}`,
      type: 'header',
      x: MARGIN - size * 0.06,
      y: canvas.height / 2 - size * 0.5,
      width: canvas.width - MARGIN,
      fontSize: size,
      fontFamily: headFamily,
      fontStyle: 'normal',
      fill: onGround(brand.ghostNumeral.fill, { onLight, onGrass }),
      opacity: brand.ghostNumeral.opacity,
      align: 'left',
      lineHeight: 1,
    });
    out.layerOrder.push('sc-nummer');
  }
  if (spec.blume && brand.layout.sunflower && bg.kind === 'farbe') {
    // A large sunflower in the ground's tone, cut by the bottom-right corner
    // (Dd_BXcKiDy2/03, Ddouf0QiL1w/02); drawn before the text, which sits on it.
    out.assetInstances.push({
      id: 'sc-blume',
      assetId: onLight ? 'sunflower-green' : onGrass ? 'sunflower-schwarz' : 'sunflower-weiss',
      x: canvas.width - BLUME.size * 0.22,
      y: canvas.height - BLUME.size * 0.18,
      scale: BLUME.size / ASSET_TARGET_SIZE,
      rotation: 0,
      opacity: onLight ? BLUME.onLight : onGrass ? BLUME.onGrass : BLUME.onDark,
    });
    out.layerOrder.push('sc-blume');
  }
  const edges: number[] = [];
  for (const item of placed) {
    item.place(y);
    y += item.height + item.after;
    edges.push(y - item.after);
  }
  if (brand.layout.raster && bg.kind === 'farbe' && !onLight) {
    // Hairlines in the light green frame a plain dark slide (Db-_V4HCvrJ):
    // one down the left margin, one above the block, one under its first
    // part when more follows. Drawn first, under the text.
    const ink = brand.absatzOnDark ?? textColor;
    const w = RASTER.width;
    const lines = [
      rect('sc-raster-links', RASTER.left, 0, w, canvas.height, ink),
      rect('sc-raster-oben', 0, blockTop - RASTER.gap, canvas.width, w, ink),
      ...(placed.length > 1
        ? [rect('sc-raster-kopf', 0, edges[0]! + RASTER.gap / 2, canvas.width, w, ink)]
        : []),
    ];
    out.shapeInstances.unshift(...lines);
    out.layerOrder.unshift(...lines.map((l) => l.id));
  }
  if (kopfband) {
    // The band runs from the top to just above the first card.
    const card = out.shapeInstances.find((shape) => shape.id.endsWith('-card'));
    if (card) {
      const end = card.y - card.height / 2 - GAP;
      const band = rect('sc-kopfband', 0, 0, canvas.width, end, SHAREPIC_COLOR_HEX[kopfband]);
      out.shapeInstances.unshift(band);
      out.layerOrder.unshift(band.id);
    }
  }
  // Top/bottom text: dense across the measured block plus a gutter, from the
  // slide edge nearest the block — position and text side are independent, so
  // the block can sit away from `textSeite`; a block near the middle keeps it.
  if (scrimSide) {
    const centre = blockTop + total / 2;
    const side =
      Math.abs(centre - canvas.height / 2) < canvas.height * 0.1
        ? scrimSide
        : centre < canvas.height / 2
          ? 'oben'
          : 'unten';
    setScrim(
      side,
      side === 'unten' ? canvas.height - blockTop + SCRIM_GUTTER : blockTop + total + SCRIM_GUTTER
    );
  }

  // ── Extras ───────────────────────────────────────────────────────────────
  drawSlideChrome(ctx, {
    spec,
    position,
    areaTop,
    blockTop,
    total,
    circle,
    ortInColumn,
    ortBesideCircle,
    footX,
    ortBottom,
    shadow,
    footerOnLight,
    footerDarkInk,
    footerGround,
    topGround,
    showLogo,
    logoCentred,
    logo,
    swipeOn,
    arrow,
    weiter,
    weiterLines,
    weiterRight,
    weiterWidth,
    weiterSize,
    page,
    quelleSize,
    quelleText,
    quelleY,
    quelleWidth,
    kiText,
    kiTop,
    kiHeight,
  });
  if (brand.cardStyle === 'brutal') brutalCards(out);
  return out;
}

/** `ink` when it reads at 4.5:1 on `ground`, else null. */
function readsOn(ink: string, ground: string): string | null {
  const a = luminance(ink);
  const b = luminance(ground);
  return a !== null && b !== null && contrastRatio(a, b) >= 4.5 ? ink : null;
}

/** GJ AT's cards: square, on a black edge with a hard offset shadow (DehRgj4jAe9). */
const BRUTAL = { edge: 5, shadow: 12 } as const;

function brutalCards(out: ComposedSlide): void {
  const cards = out.shapeInstances.filter(
    (shape) =>
      (shape.id.endsWith('-card') || shape.id.endsWith('-karte')) && shape.fill === '#FFFFFF'
  );
  for (const card of cards) {
    card.cornerRadius = 0;
    const edge: ShapeInstance = {
      ...card,
      id: `${card.id}-rand`,
      fill: '#000000',
      width: card.width + 2 * BRUTAL.edge,
      height: card.height + 2 * BRUTAL.edge,
      shadowColor: '#000000',
      shadowBlur: 0,
      shadowOffsetX: BRUTAL.shadow,
      shadowOffsetY: BRUTAL.shadow,
      shadowOpacity: 1,
    };
    out.shapeInstances.splice(out.shapeInstances.indexOf(card), 0, edge);
    const at = out.layerOrder.indexOf(card.id);
    out.layerOrder.splice(at < 0 ? out.layerOrder.length : at, 0, edge.id);
  }
}
