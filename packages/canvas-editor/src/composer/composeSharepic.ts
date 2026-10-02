/**
 * Sharepic spec → freeform canvas state.
 *
 * The free-text creator's model writes ONE text group (kicker, headline, text,
 * quote, list, button) plus a background and a few extras; this turns it into
 * the element collections a person builds by hand in the freeform editor, so
 * the draft stays fully editable. The look follows the parties' current
 * Instagram posts (analysed 10/2026): one compact text block, a headline that
 * fills the width in sentence case, exactly one accent, no flat backgrounds,
 * built contrast on photos.
 *
 * Pure: no React, no Konva. Text is measured through the injected `measure`.
 */
import {
  type SharepicColor,
  type SharepicItem,
  type SharepicPhotoAttribution,
  type SharepicSpec,
} from '@gruenerator/contracts';

import { getBrandTheme } from '../brand/theme';
import { type AssetInstance } from '../utils/canvasAssets';
import { createCircleBadgeInstance } from '../utils/circleBadgeUtils';
import { COLORS, DREIZEILEN_CONFIG } from '../utils/dreizeilenLayout';
import { createPillBadgeInstance } from '../utils/pillBadgeUtils';
import { createShape, type ShapeInstance } from '../utils/shapes';
import { measureTextWidthWithFont } from '../utils/textUtils';
import { VERANSTALTUNG_CONFIG } from '../utils/veranstaltungLayout';

import type { IconState } from '../configs/factory/baseTypes';
import type { AdditionalText } from '../configs/types';
import type { CircleBadgeInstance } from '../utils/circleBadgeUtils';
import type { PillBadgeInstance } from '../utils/pillBadgeUtils';

export type MeasureText = (
  text: string,
  fontSize: number,
  fontFamily: string,
  fontStyle: string
) => number;

export interface ComposeOptions {
  /** URL the canvas loads a stock photo from. */
  photoSrc: (filename: string) => string;
  attribution?: SharepicPhotoAttribution | null;
  measure?: MeasureText;
}

/** Props for the `freeform` / `freeform-at` config's `createInitialState`. */
export interface ComposedSharepic {
  templateType: 'freeform' | 'freeform-at';
  props: {
    backgroundMode: 'color' | 'image';
    backgroundColor: string;
    currentImageSrc?: string;
    hasBackgroundImage: boolean;
    imageAttribution: SharepicPhotoAttribution | null;
    additionalTexts: AdditionalText[];
    pillBadgeInstances: PillBadgeInstance[];
    circleBadgeInstances: CircleBadgeInstance[];
    shapeInstances: ShapeInstance[];
    assetInstances: AssetInstance[];
    selectedIcons: string[];
    iconStates: Record<string, IconState>;
    layerOrder: string[];
  };
}

const WIDTH = DREIZEILEN_CONFIG.canvas.width;
const HEIGHT = DREIZEILEN_CONFIG.canvas.height;
/** 6.5 % of the width — the margin the posts use. */
const MARGIN = 70;
const GAP = 30;
const FOOTER = 130;

export const SHAREPIC_COLOR_HEX: Record<SharepicColor, string> = {
  tanne: COLORS.TANNE,
  dunkeltanne: '#00261A',
  grasgruen: '#00CC4F',
  mint: '#D5EEE6',
  dunkelgruen: getBrandTheme('de-AT').colors.primary,
  hellgruen: getBrandTheme('de-AT').colors.secondary,
  weiss: '#FFFFFF',
};

/** Dark greens get a diagonal gradient — no flat backgrounds. */
const GRADIENTS: Partial<Record<SharepicColor, string[]>> = {
  tanne: ['#00261A', '#005538', '#0A7A3F'],
  dunkeltanne: ['#00140D', '#00261A', '#005538'],
  grasgruen: ['#00A33F', '#00CC4F', '#5BDC6E'],
  dunkelgruen: ['#1B5E2C', '#257639', '#4FAA3A'],
  hellgruen: ['#3F9A2A', '#56af31', '#7CC650'],
};

const LIGHT: readonly SharepicColor[] = ['mint', 'weiss'];

/** DE accent: a lime marker box. AT accent: a yellow Vollkorn line. */
const LIME = '#BEFF60';

const defaultMeasure: MeasureText = (text, fontSize, fontFamily, fontStyle) =>
  measureTextWidthWithFont(text, fontSize, fontFamily, fontStyle);

/** Greedy word wrap; a single over-long word keeps its own line. */
export function wrapWords(
  text: string,
  width: number,
  measureLine: (line: string) => number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && measureLine(candidate) > width) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

const stripMarks = (text: string) => text.replace(/\*\*|__/g, '');

interface Column {
  x: number;
  width: number;
  align: 'left' | 'center';
}

interface Placed {
  height: number;
  /** Space after this item. */
  after: number;
  place: (y: number) => void;
}

export function composeSharepic(spec: SharepicSpec, options: ComposeOptions): ComposedSharepic {
  const measure = options.measure ?? defaultMeasure;
  const theme = getBrandTheme(spec.locale);
  const isAt = spec.locale === 'de-AT';
  const bg = spec.background;
  const darkText = isAt ? theme.colors.primary : SHAREPIC_COLOR_HEX.dunkeltanne;

  const out: ComposedSharepic['props'] = {
    backgroundMode: bg.kind === 'farbe' ? 'color' : 'image',
    backgroundColor:
      SHAREPIC_COLOR_HEX[
        bg.kind === 'farbe' ? bg.color : bg.kind === 'foto-oben' ? bg.panelColor : 'dunkeltanne'
      ],
    hasBackgroundImage: bg.kind !== 'farbe',
    imageAttribution: bg.kind !== 'farbe' ? (options.attribution ?? null) : null,
    additionalTexts: [],
    pillBadgeInstances: [],
    circleBadgeInstances: [],
    shapeInstances: [],
    assetInstances: [],
    selectedIcons: [],
    iconStates: {},
    layerOrder: [],
  };
  if (bg.kind !== 'farbe') out.currentImageSrc = options.photoSrc(bg.filename);

  const addShape = (shape: ShapeInstance) => {
    out.shapeInstances.push(shape);
    out.layerOrder.push(shape.id);
  };
  const rect = (id: string, x: number, y: number, w: number, h: number, fill: string) => {
    const shape = createShape('rect', x + w / 2, y + h / 2, fill, fill);
    return Object.assign(shape, { id, width: w, height: h });
  };

  // ── Surface: what the text sits on, and the planes that make it ──────────
  let areaTop = 0;
  let areaBottom = HEIGHT;
  let surface: SharepicColor | 'foto' = 'foto';
  let column: Column = {
    x: MARGIN,
    width: WIDTH - 2 * MARGIN,
    align: spec.align === 'zentriert' ? 'center' : 'left',
  };

  if (bg.kind === 'farbe') {
    surface = bg.color;
    const stops = GRADIENTS[bg.color];
    if (stops) {
      const plane = rect('sc-bg', 0, 0, WIDTH, HEIGHT, stops[1]);
      plane.fillGradient = {
        type: 'linear',
        angle: 60,
        stops: stops.map((color, i) => ({ offset: i / (stops.length - 1), color })),
      };
      addShape(plane);
    }
  } else if (bg.kind === 'foto-oben') {
    surface = bg.panelColor;
    areaTop = VERANSTALTUNG_CONFIG.photo.height;
    addShape(rect('sc-panel', 0, areaTop, WIDTH, HEIGHT - areaTop, out.backgroundColor));
  } else {
    // Text on a photo: a gradient from the text side into the picture.
    const side = bg.textSeite;
    const dark = isAt ? '27,94,44' : '0,38,26';
    const vertical = side === 'unten' || side === 'oben';
    const depth = vertical ? HEIGHT * 0.62 : WIDTH * 0.72;
    const scrim =
      side === 'unten'
        ? rect('sc-scrim', 0, HEIGHT - depth, WIDTH, depth, 'transparent')
        : side === 'oben'
          ? rect('sc-scrim', 0, 0, WIDTH, depth, 'transparent')
          : side === 'links'
            ? rect('sc-scrim', 0, 0, depth, HEIGHT, 'transparent')
            : rect('sc-scrim', WIDTH - depth, 0, depth, HEIGHT, 'transparent');
    const angle = { unten: 90, oben: 270, links: 180, rechts: 0 }[side];
    scrim.fillGradient = {
      type: 'linear',
      angle,
      stops: [
        { offset: 0, color: `rgba(${dark},0)` },
        { offset: 0.4, color: `rgba(${dark},0.55)` },
        { offset: 1, color: `rgba(${dark},0.92)` },
      ],
    };
    addShape(scrim);
    if (!vertical) {
      const width = WIDTH * 0.52;
      column = { x: side === 'links' ? MARGIN : WIDTH - MARGIN - width, width, align: 'left' };
    }
  }

  const onLight = surface !== 'foto' && LIGHT.includes(surface);
  const textColor = onLight ? darkText : '#FFFFFF';
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
  // The date circle's left edge sits at x 680; keep a gap to it.
  if (spec.datum) column = { ...column, width: Math.min(column.width, 560) };
  const xAlign = column.align;

  // Footer row: logo, arrow, place — the text group ends above it.
  const footerUsed = spec.logo || spec.pfeil || !!spec.ort;
  if (footerUsed) areaBottom = HEIGHT - FOOTER - (spec.ort ? spec.ort.lines.length * 48 : 0);

  // ── The text group ───────────────────────────────────────────────────────
  const placed: Placed[] = [];
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
      ...shadow,
      ...extra,
    });
    out.layerOrder.push(id);
  };

  spec.items.forEach((item: SharepicItem, index) => {
    const id = `sc-${index}-${item.type}`;
    switch (item.type) {
      case 'dachzeile': {
        const size = 38;
        placed.push({
          height: size * 1.2,
          after: 16,
          place: (y) => text(id, item.text, y, size, theme.fonts.body, { fontStyle: 'bold' }),
        });
        break;
      }
      case 'headline': {
        const family = theme.fonts.headline;
        const lineHeight = isAt ? 0.95 : 0.92;
        // Fit: the longest line fills ~92 % of the column, within sane bounds.
        const widest = Math.max(...item.lines.map((l) => measure(l, 100, family, 'normal')));
        const maxSize = item.lines.length <= 2 ? 190 : 150;
        const size = Math.round(
          Math.min(maxSize, Math.max(72, (column.width * 0.92 * 100) / widest))
        );
        const step = size * lineHeight;
        // Consecutive plain lines share one text element; the accent line is its own.
        const segments: { lines: string[]; accent: boolean }[] = [];
        item.lines.forEach((l, i) => {
          const accent = item.akzent === i;
          const last = segments[segments.length - 1];
          if (last && !last.accent && !accent) last.lines.push(l);
          else segments.push({ lines: [l], accent });
        });
        placed.push({
          height: item.lines.length * step,
          after: Math.round(size * 0.35),
          place: (y) => {
            let cursor = y;
            segments.forEach((segment, s) => {
              const segId = `${id}-${s}`;
              const value = segment.lines.join('\n');
              if (segment.accent && isAt) {
                text(segId, value, cursor, Math.round(size * 0.95), theme.fonts.quoteEmphasis, {
                  fontStyle: 'bold italic',
                  fill: onLight ? theme.colors.secondary : theme.colors.accent,
                  lineHeight,
                  type: 'header',
                });
              } else if (segment.accent) {
                // DE marker: dark text on a lime box sized to the line.
                const w = measure(value, size, family, 'normal') + size * 0.4;
                const x = xAlign === 'center' ? WIDTH / 2 - w / 2 : column.x - size * 0.15;
                const box = rect(`${segId}-box`, x, cursor + size * 0.04, w, step, LIME);
                box.rotation = -2;
                addShape(box);
                text(segId, value, cursor, size, family, {
                  fill: SHAREPIC_COLOR_HEX.dunkeltanne,
                  lineHeight,
                  type: 'header',
                  shadowOpacity: 0,
                });
              } else {
                text(segId, value, cursor, size, family, { lineHeight, type: 'header' });
              }
              cursor += segment.lines.length * step;
            });
          },
        });
        break;
      }
      case 'text': {
        const size = 42;
        const lines = wrapWords(stripMarks(item.text), column.width, (l) =>
          measure(l, size, theme.fonts.body, 'normal')
        );
        placed.push({
          height: lines.length * size * 1.25,
          after: GAP,
          place: (y) => text(id, item.text, y, size, theme.fonts.body, { lineHeight: 1.25 }),
        });
        break;
      }
      case 'zitat': {
        const size = 52;
        const mark = 90;
        const lines = wrapWords(item.text, column.width, (l) =>
          measure(l, size, theme.fonts.body, 'normal')
        );
        const quoteHeight = lines.length * size * 1.2;
        const nameSize = 38;
        const signature = nameSize * 1.25 * (item.funktion ? 2 : 1);
        placed.push({
          height: mark + 10 + quoteHeight + 24 + signature,
          after: GAP,
          place: (y) => {
            const markId = `${id}-mark`;
            out.assetInstances.push({
              id: markId,
              assetId: isAt ? 'quote-mark-gelb' : 'quote-mark-weiss',
              x: xAlign === 'center' ? WIDTH / 2 : column.x + mark / 2,
              y: y + mark / 2,
              scale: mark / 150,
              rotation: 0,
              opacity: 1,
            });
            out.layerOrder.push(markId);
            text(id, item.text, y + mark + 10, size, theme.fonts.body, { lineHeight: 1.2 });
            const signatureText = item.funktion
              ? `**${item.name}**\n${item.funktion}`
              : `**${item.name}**`;
            text(
              `${id}-name`,
              signatureText,
              y + mark + 10 + quoteHeight + 24,
              nameSize,
              theme.fonts.body,
              {
                lineHeight: 1.25,
              }
            );
          },
        });
        break;
      }
      case 'liste': {
        const size = 40;
        const pad = 46;
        const inner = column.width - 2 * pad;
        const body = item.items.map((i) => `• ${i}`).join('\n');
        const lineCount = item.items.reduce(
          (n, i) =>
            n +
            wrapWords(`• ${stripMarks(i)}`, inner - 40, (l) =>
              measure(l, size, theme.fonts.body, 'normal')
            ).length,
          0
        );
        const height = lineCount * size * 1.3 + 2 * pad;
        placed.push({
          height,
          after: GAP,
          place: (y) => {
            const card = createShape(
              'rounded-rect',
              column.x + column.width / 2,
              y + height / 2,
              '#FFFFFF',
              '#FFFFFF'
            );
            Object.assign(card, {
              id: `${id}-card`,
              width: column.width,
              height,
              cornerRadius: 32,
            });
            addShape(card);
            out.additionalTexts.push({
              id,
              text: body,
              type: 'body',
              x: column.x + pad,
              y: y + pad,
              width: inner,
              fontSize: size,
              fontFamily: theme.fonts.body,
              fontStyle: 'normal',
              fill: darkText,
              lineHeight: 1.3,
            });
            out.layerOrder.push(id);
          },
        });
        break;
      }
      case 'button': {
        const size = 44;
        const pill = createPillBadgeInstance('slider', {
          id,
          text: item.text,
          fontSize: size,
          fontFamily: theme.fonts.headline,
          backgroundColor: onLight ? theme.colors.primary : isAt ? theme.colors.accent : LIME,
          textColor: onLight
            ? '#FFFFFF'
            : isAt
              ? theme.colors.primary
              : SHAREPIC_COLOR_HEX.dunkeltanne,
          paddingX: 36,
          paddingY: 18,
          cornerRadius: 60,
        });
        const height = size + 2 * pill.paddingY;
        const width = measure(item.text, size, theme.fonts.headline, 'normal') + 2 * pill.paddingX;
        placed.push({
          height,
          after: GAP,
          place: (y) => {
            const x = xAlign === 'center' ? WIDTH / 2 - width / 2 : column.x;
            out.pillBadgeInstances.push({ ...pill, x, y });
            out.layerOrder.push(id);
          },
        });
        break;
      }
    }
  });

  const total =
    placed.reduce((sum, p) => sum + p.height + p.after, 0) -
    (placed[placed.length - 1]?.after ?? 0);
  const top = areaTop + MARGIN + (spec.stoerer && spec.position === 'oben' ? 40 : 0);
  const bottom = areaBottom - MARGIN;
  let y =
    spec.position === 'oben'
      ? top
      : spec.position === 'unten'
        ? Math.max(top, bottom - total)
        : Math.max(top, (top + bottom) / 2 - total / 2);
  for (const item of placed) {
    item.place(y);
    y += item.height + item.after;
  }

  // ── Extras ───────────────────────────────────────────────────────────────
  if (spec.stoerer) {
    const radius = 125;
    const size = 38;
    const lines = wrapWords(spec.stoerer.text, radius * 1.45, (l) =>
      measure(l, size, theme.fonts.headline, 'normal')
    ).slice(0, 3);
    // Opposite corner from the text group, so it never covers it.
    const atBottom = spec.position === 'oben';
    out.circleBadgeInstances.push(
      createCircleBadgeInstance('default', {
        id: 'sc-stoerer',
        x: WIDTH - MARGIN - radius + 30,
        y: atBottom ? HEIGHT - FOOTER - radius : areaTop + MARGIN + radius - 30,
        radius,
        rotation: -8,
        backgroundColor: theme.colors.stoerer,
        textColor: '#FFFFFF',
        textLines: lines.map((value, i) => ({
          text: value,
          yOffset: (i - (lines.length - 1) / 2) * size * 1.1,
          fontFamily: theme.fonts.headline,
          fontSize: size,
          fontWeight: 'bold' as const,
        })),
      })
    );
    out.layerOrder.push('sc-stoerer');
  }

  if (spec.datum) {
    const c = VERANSTALTUNG_CONFIG.circle;
    const t = VERANSTALTUNG_CONFIG.circleText;
    out.circleBadgeInstances.push(
      createCircleBadgeInstance('default', {
        id: 'sc-datum',
        x: c.centerX,
        y: bg.kind === 'foto-oben' ? c.centerY : HEIGHT / 2,
        radius: c.radius,
        rotation: c.rotation,
        backgroundColor: isAt ? theme.colors.stoerer : COLORS.HIMMEL,
        textColor: c.textColor,
        textLines: [
          {
            text: spec.datum.weekday,
            yOffset: t.weekday.yOffset,
            fontFamily: theme.fonts.body,
            fontSize: t.weekday.fontSize,
            fontWeight: 'bold',
          },
          {
            text: spec.datum.date,
            yOffset: t.date.yOffset,
            fontFamily: theme.fonts.body,
            fontSize: t.date.fontSize,
            fontWeight: 'normal',
          },
          {
            text: spec.datum.time,
            yOffset: t.time.yOffset,
            fontFamily: theme.fonts.body,
            fontSize: t.time.fontSize,
            fontWeight: 'bold',
          },
        ],
      })
    );
    out.layerOrder.push('sc-datum');
  }

  if (spec.ort) {
    const size = 38;
    const height = spec.ort.lines.length * size * 1.25;
    out.additionalTexts.push({
      id: 'sc-ort',
      text: spec.ort.lines.join('\n'),
      type: 'body',
      x: MARGIN,
      y: HEIGHT - FOOTER / 2 - height + 20,
      width: WIDTH - 2 * MARGIN - 200,
      fontSize: size,
      fontFamily: theme.fonts.body,
      fontStyle: 'normal',
      fill: textColor,
      lineHeight: 1.25,
      ...shadow,
    });
    out.layerOrder.push('sc-ort');
  }

  const footerY = HEIGHT - FOOTER / 2 - 10;
  if (spec.logo) {
    const centred = xAlign === 'center' && !spec.ort;
    const size = isAt ? 170 : 120;
    out.assetInstances.push({
      id: 'sc-logo',
      assetId: isAt ? (onLight ? 'gruene-at-logo-gruen' : 'gruene-at-logo-weiss') : 'sunflower',
      x: centred ? WIDTH / 2 : WIDTH - MARGIN - size / 2,
      y: footerY,
      scale: size / 150,
      rotation: 0,
      opacity: 1,
    });
    out.layerOrder.push('sc-logo');
  }
  if (spec.pfeil) {
    const size = 110;
    const nextToLogo = spec.logo && !(xAlign === 'center' && !spec.ort);
    out.selectedIcons.push('sc-pfeil');
    out.iconStates['sc-pfeil'] = {
      iconId: 'tabler:arrow-right',
      x: nextToLogo ? WIDTH - MARGIN - 200 - size / 2 : WIDTH - MARGIN - size / 2,
      y: footerY,
      scale: size / 120,
      rotation: 0,
      color: textColor,
    };
    out.layerOrder.push('sc-pfeil');
  }

  return { templateType: isAt ? 'freeform-at' : 'freeform', props: out };
}
