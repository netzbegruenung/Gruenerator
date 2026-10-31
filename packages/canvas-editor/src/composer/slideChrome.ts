import { type ComposerBrand, onGround } from '@ggraphic/editor/brand/composerBrand';
import { ASSET_TARGET_SIZE } from '@ggraphic/editor/utils/canvasAssets';
import { createCircleBadgeInstance } from '@ggraphic/editor/utils/circleBadgeUtils';
import { createShape } from '@ggraphic/editor/utils/shapes';
import { type SharepicSeitenzahl, type SharepicSlide } from '@gruenerator/contracts';

import { COLORS } from '../utils/dreizeilenLayout';
import { VERANSTALTUNG_CONFIG } from '../utils/veranstaltungLayout';

import { BRUSH_ARROW, pageDots, SHAREPIC_COLOR_HEX } from './chromeParts';
import { placeHandMarks } from './handMarks';
import { type ARROW, ARROW_ICON, FOOTER, KI_LABEL, MARGIN } from './sharepicLayoutConstants';
import { sharepicTheme } from './sharepicThemes';
import { type SlideCtx } from './slideContext';
import { type slideInk } from './slideInk';
import {
  fitStoererText,
  STOERER_LINE_STEP,
  STOERER_MAX_SIZE_SHARE,
  STOERER_MIN_READABLE,
  STOERER_RADII,
  wrapWords,
} from '@ggraphic/editor/composer/textFit';

type SlideInk = ReturnType<typeof slideInk>;

/**
 * What the chrome reads from its slide besides `SlideCtx`. Passed once, after
 * the text group is placed: nothing reassigns any of it afterwards.
 */
export interface ChromeInputs {
  spec: SharepicSlide;
  position: SharepicSlide['position'];
  areaTop: number;
  blockTop: number;
  total: number;
  circle: { x: number; y: number; radius: number } | null;
  ortInColumn: boolean;
  ortBesideCircle: boolean;
  footX: number;
  ortBottom: number;
  shadow: SlideInk['shadow'];
  footerOnLight: SlideInk['footerOnLight'];
  footerDarkInk: SlideInk['footerDarkInk'];
  footerGround: SlideInk['footerGround'];
  topGround: SlideInk['topGround'];
  showLogo: boolean;
  logoCentred: boolean;
  logo: ComposerBrand['logo'];
  swipeOn: boolean;
  arrow: (typeof ARROW)[keyof typeof ARROW];
  weiter: string | null;
  weiterLines: string[];
  weiterRight: number;
  weiterWidth: number;
  weiterSize: number;
  page: { index: number; count: number; style: SharepicSeitenzahl } | null;
  quelleSize: number;
  quelleText: string;
  quelleY: number;
  quelleWidth: number;
  kiText: string | null;
  kiTop: number;
  kiHeight: number;
}

/** The slide's chrome after layout: Störer, date, place, logo, arrow, page, source, AI label, hand marks. */
export function drawSlideChrome(ctx: SlideCtx, inputs: ChromeInputs): void {
  const {
    measure,
    theme,
    isAt,
    canvas,
    out,
    darkText,
    onGrass,
    textColor,
    darkInk,
    onLight,
    logoAt,
    addShape,
  } = ctx;
  const themeDef = sharepicTheme(ctx.thema);
  const {
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
  } = inputs;
  if (spec.stoerer) {
    // Opposite corner from the text group, so it never covers it.
    const atBottom = position === 'oben';
    const centreAt = (r: number) => ({
      x: canvas.width - MARGIN - r + 30,
      y: atBottom ? canvas.height - FOOTER - r : areaTop + MARGIN + r - 30,
    });
    // A fitted Störer grows towards the posts' one (about 40 % of the width,
    // text within 90 %) as far as the text block leaves room, and shrinks
    // below 125 rather than cover a block that reaches its corner; the block
    // counts as full width.
    const { stoerer } = ctx.brand;
    const clearsBlock = (r: number) =>
      atBottom ? centreAt(r).y - r >= blockTop + total : centreAt(r).y + r <= blockTop;
    const stoererText = spec.stoerer.text;
    const fitted = new Map<string, ReturnType<typeof fitStoererText>>();
    const fitAt = (r: number, minSize = STOERER_MIN_READABLE) => {
      const key = `${r}:${minSize}`;
      if (!fitted.has(key)) {
        fitted.set(
          key,
          fitStoererText(
            stoererText,
            r,
            (l, s) => measure(l, s, theme.fonts.headline, 'bold'),
            Math.round(r * STOERER_MAX_SIZE_SHARE),
            minSize
          )
        );
      }
      return fitted.get(key) ?? null;
    };
    // A long text gets smaller type before its circle covers the block; only
    // a text that fits no circle beside the block (one long word) takes the
    // largest circle that holds it.
    const fixed = stoerer.size === 'fit' ? null : stoerer.size;
    const radius = fixed
      ? fixed.radius
      : (STOERER_RADII.find((r) => clearsBlock(r) && fitAt(r)) ??
        STOERER_RADII.find((r) => clearsBlock(r) && fitAt(r, 20)) ??
        STOERER_RADII[0]!);
    const colors = onGround(stoerer.colors, { onLight, onGrass });
    const { lines, size } = fixed
      ? {
          lines: wrapWords(spec.stoerer.text, radius * 1.45, (l) =>
            measure(l, fixed.fontSize, theme.fonts.headline, 'normal')
          ).slice(0, 3),
          size: fixed.fontSize,
        }
      : (fitAt(radius) ??
        fitAt(radius, 20) ??
        fitAt(radius, 1) ?? { lines: [stoererText], size: 1 });
    out.circleBadgeInstances.push(
      createCircleBadgeInstance('default', {
        id: 'sc-stoerer',
        ...centreAt(radius),
        radius,
        rotation: stoerer.rotation,
        backgroundColor: colors.fill,
        textColor: colors.ink,
        textLines: lines.map((value, i) => ({
          text: value,
          yOffset: (i - (lines.length - 1) / 2) * size * STOERER_LINE_STEP,
          fontFamily: theme.fonts.headline,
          fontSize: size,
          fontWeight: 'bold' as const,
        })),
      })
    );
    out.layerOrder.push('sc-stoerer');
  }

  if (spec.datum && circle) {
    // DE: Tanne on light and grass-green ground, grass green on dark ground
    // and photos — never a third colour. AT keeps its magenta. A theme with
    // badge colours sets the circle like its badges.
    const themed = themeDef?.badge?.[onLight ? 'light' : 'dark'] ?? null;
    const circleColors = themed
      ? { background: themed.fill, text: themed.ink }
      : isAt
        ? { background: theme.colors.stoerer, text: VERANSTALTUNG_CONFIG.circle.textColor }
        : darkInk
          ? { background: COLORS.TANNE, text: '#ffffff' }
          : { background: SHAREPIC_COLOR_HEX.grasgruen, text: COLORS.TANNE };
    const c = VERANSTALTUNG_CONFIG.circle;
    const t = VERANSTALTUNG_CONFIG.circleText;
    // The template's type is set for its radius; a smaller circle scales it.
    const k = circle.radius / c.radius;
    // Only what is present, centred on the circle: three lines keep the
    // template offsets, a pair or a single line sits symmetrically.
    const { weekday, date, time } = spec.datum;
    const present = [
      ...(weekday === undefined
        ? []
        : [{ text: weekday, spec: t.weekday, fontWeight: 'bold' as const }]),
      ...(date === undefined ? [] : [{ text: date, spec: t.date, fontWeight: 'normal' as const }]),
      ...(time === undefined ? [] : [{ text: time, spec: t.time, fontWeight: 'bold' as const }]),
    ];
    const pairOffsets = [-35, 40];
    const circleLines = present.map((line, i) => ({
      text: line.text,
      yOffset: Math.round(
        (present.length === 3 ? line.spec.yOffset : present.length === 2 ? pairOffsets[i]! : 0) * k
      ),
      fontFamily: ctx.brand.headlineFace.datum ? theme.fonts.headline : theme.fonts.body,
      fontSize: Math.round(line.spec.fontSize * k),
      fontWeight: ctx.brand.headlineFace.datum ? ('normal' as const) : line.fontWeight,
    }));
    out.circleBadgeInstances.push(
      createCircleBadgeInstance('default', {
        id: 'sc-datum',
        x: circle.x,
        y: circle.y,
        radius: circle.radius,
        rotation: c.rotation,
        backgroundColor: circleColors.background,
        textColor: circleColors.text,
        textLines: circleLines,
      })
    );
    out.layerOrder.push('sc-datum');
  }

  if (spec.ort && !ortInColumn) {
    const size = 38;
    const height = spec.ort.lines.length * size * 1.25;
    // Beside a free date circle the place reads with it: right-aligned to the
    // circle, on its middle. Otherwise it stacks bottom-left above the label.
    const beside = ortBesideCircle && circle;
    const right = circle ? circle.x - circle.radius - 30 : canvas.width - MARGIN - 200;
    out.additionalTexts.push({
      id: 'sc-ort',
      text: spec.ort.lines.join('\n'),
      type: 'body',
      x: footX,
      y: beside ? circle.y - height / 2 : ortBottom - height,
      width: right - footX,
      fontSize: size,
      fontFamily: theme.fonts.body,
      fontStyle: 'normal',
      fill: textColor,
      lineHeight: 1.25,
      ...(beside ? { align: 'right' as const } : {}),
      ...shadow,
    });
    out.layerOrder.push('sc-ort');
  }

  const logoOnLight = logoAt.current ? false : footerOnLight;
  const logoDarkInk = logoAt.current ? true : footerDarkInk;
  if (showLogo) {
    const mark = onGround(logo.asset, {
      onLight: logoOnLight,
      onGrass: logoDarkInk && !logoOnLight,
    });
    out.assetInstances.push({
      id: 'sc-logo',
      assetId: mark.assetId,
      x: logoAt.current?.x ?? (logoCentred ? canvas.width / 2 : MARGIN + logo.size / 2),
      // x/y is the centre.
      y: canvas.height - logo.bottom - logo.height / 2,
      scale: logo.size / ASSET_TARGET_SIZE,
      rotation: 0,
      opacity: mark.opacity,
    });
    out.layerOrder.push('sc-logo');
  }
  const sign = themeDef?.sign ?? null;
  if (sign) {
    // The theme's sign on the logo's line, at the right edge (left of the
    // swipe-on arrow); where a date circle holds that corner, top right. A
    // sticker the user can move, resize or drop. It takes the ground it
    // stands on, which under a photo strip is not the text's surface.
    const { assetId, width, height } = sign.on(circle ? topGround : footerGround);
    const arrowSpan = swipeOn ? arrow.size * arrow.glyph + 24 : 0;
    out.assetInstances.push({
      id: sign.id,
      assetId,
      x: canvas.width - (circle ? MARGIN : arrow.right + arrowSpan) - width / 2,
      y: circle ? MARGIN + height / 2 : canvas.height - logo.bottom - logo.height / 2,
      scale: width / ASSET_TARGET_SIZE,
      rotation: 0,
      opacity: 1,
    });
    out.layerOrder.push(sign.id);
  }
  if (swipeOn) {
    // Bottom-right, centred on x/y: AT a long brush stroke, DE a small arrow
    // near the corner.
    const { size, right, bottom, glyph } = arrow;
    const x = canvas.width - right - (size * glyph) / 2;
    const y = canvas.height - bottom - size * 0.08;
    if (isAt) {
      out.assetInstances.push({
        id: 'sc-pfeil',
        assetId: footerOnLight ? BRUSH_ARROW.onLight : BRUSH_ARROW.onDark,
        x,
        y,
        // The asset is drawn edge to edge; its width is the longer side.
        scale: (size * glyph) / ASSET_TARGET_SIZE,
        rotation: 0,
        opacity: 1,
      });
    } else {
      out.selectedIcons.push('sc-pfeil');
      out.iconStates['sc-pfeil'] = {
        iconId: ARROW_ICON,
        x,
        y,
        scale: size / 120,
        rotation: 0,
        color: footerDarkInk ? darkText : '#FFFFFF',
      };
    }
    out.layerOrder.push('sc-pfeil');
    if (weiter) {
      // Right-aligned against the arrow, on its line.
      out.additionalTexts.push({
        id: 'sc-weiter',
        text: weiterLines.join('\n'),
        type: 'body',
        x: weiterRight - weiterWidth - 4,
        y: y - weiterSize * 0.6 - (weiterLines.length - 1) * weiterSize * 1.2,
        width: weiterWidth + 8,
        fontSize: weiterSize,
        fontFamily: theme.fonts.body,
        fontStyle: 'bold',
        fill: footerDarkInk ? darkText : '#FFFFFF',
        align: 'right',
        lineHeight: 1.2,
        ...shadow,
      });
      out.layerOrder.push('sc-weiter');
    }
  }

  if (page) {
    // Top corner, clear of a Störer: right unless the Störer owns it.
    const ink = darkInk ? darkText : '#FFFFFF';
    const stoererTop = !!spec.stoerer && position !== 'oben';
    const y = 44;
    if (page.style === 'bruch') {
      const label = `${page.index + 1}/${page.count}`;
      const size = 30;
      const width = measure(label, size, theme.fonts.body, 'bold') + 8;
      out.additionalTexts.push({
        id: 'sc-seite',
        text: label,
        type: 'body',
        x: stoererTop ? MARGIN : canvas.width - MARGIN - width,
        y,
        width,
        fontSize: size,
        fontFamily: theme.fonts.body,
        fontStyle: 'bold',
        fill: ink,
        opacity: 0.85,
        align: stoererTop ? 'left' : 'right',
        lineHeight: 1,
        ...shadow,
      });
      out.layerOrder.push('sc-seite');
    } else {
      for (const disc of pageDots(page.count, page.index, canvas.width / 2, y, ink)) addShape(disc);
    }
  }

  if (spec.quelle) {
    const size = quelleSize;
    out.additionalTexts.push({
      id: 'sc-quelle',
      text: quelleText,
      type: 'body',
      x: footX,
      y: quelleY,
      width: quelleWidth,
      fontSize: size,
      fontFamily: theme.fonts.body,
      fontStyle: 'normal',
      fill: textColor,
      opacity: 0.8,
      lineHeight: 1.2,
      ...shadow,
    });
    out.layerOrder.push('sc-quelle');
  }

  if (kiText) {
    const { fontSize, margin, paddingX, paddingY, radius } = KI_LABEL;
    const width = measure(kiText, fontSize, KI_LABEL.fontFamily, 'bold') + 2 * paddingX;
    const plate = createShape(
      'rounded-rect',
      margin + width / 2,
      kiTop + kiHeight / 2,
      '#2B2B2B',
      '#2B2B2B'
    );
    Object.assign(plate, {
      id: 'sc-ki-label-bg',
      width,
      height: kiHeight,
      cornerRadius: radius,
      // Lighter on dark ground and photos; light ground keeps the server
      // label's plate, or the white text would lose its contrast.
      opacity: darkInk ? 0.55 : 0.4,
    });
    addShape(plate);
    out.additionalTexts.push({
      id: 'sc-ki-label',
      text: kiText,
      type: 'body',
      x: margin + paddingX,
      y: kiTop + paddingY,
      width: width - 2 * paddingX + 4,
      fontSize,
      fontFamily: KI_LABEL.fontFamily,
      fontStyle: 'bold',
      fill: '#FFFFFF',
      opacity: 0.85,
      lineHeight: 1,
    });
    out.layerOrder.push('sc-ki-label');
  }

  // Hand marks: a white one takes the brand's mark colour, a green one its green.
  const { handMarks } = ctx.brand;
  placeHandMarks(out, measure, (fill) =>
    fill.toUpperCase() === '#FFFFFF'
      ? handMarks.white
      : onGrass
        ? (handMarks.greenOnGrass ?? handMarks.green)
        : handMarks.green
  );
}
