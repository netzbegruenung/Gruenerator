import { ASSET_TARGET_SIZE } from '@ggraphic/editor/utils/canvasAssets';
import { createShape } from '@ggraphic/editor/utils/shapes';
import {
  type SharepicColor,
  type SharepicSlide,
  type SharepicTextSide,
} from '@gruenerator/contracts';

import { SHAREPIC_COLOR_HEX } from './chromeParts';
import { type BildItem, type SteckbriefItem } from './composeTypes';
import { GRADIENTS, SCRIM_ANGLE, SCRIM_EASE } from './sharepicGround';
import { KI_LABEL, MARGIN, STECKBRIEF } from './sharepicLayoutConstants';
import { type SlideCtx } from './slideContext';
import {
  placeArrow,
  shapePoint,
  steckbriefSlots,
  outlineSpan,
  steckbriefOutline,
  type Box,
  type PlacedArrow,
} from './steckbriefLayout';
import { balancedWrap } from './textFit';

/** What a steckbrief reads from its slide besides `SlideCtx`; all final before `place`. */
export interface SteckbriefScene {
  person: Box | null;
  bg: SharepicSlide['background'];
  bild: BildItem | null;
  surface: SharepicColor | 'foto';
  swipeOn: boolean;
  kiText: string | null;
  kiTop: number;
  kiHeight: number;
}

/**
 * A steckbrief portrait melts into the ground at its sides (and, with the
 * photo's own background, its top), so the traits and the greeting reaching over it sit on
 * the slide, not on a hard edge. Strips in the ground's colour (sampled
 * along a gradient ground), opaque outside, clear inside.
 */
export function fadeIntoGround(
  ctx: Pick<SlideCtx, 'canvas' | 'rect' | 'addShape'>,
  box: { x: number; y: number; width: number; height: number },
  color: SharepicColor,
  withTop: boolean
) {
  const { canvas, rect, addShape } = ctx;
  const gradient = GRADIENTS[color];
  const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
  /** The ground at height `y`: the flat colour, or the vertical gradient's colour there. */
  const groundAt = (y: number) => {
    if (!gradient || gradient.type === 'radial') return rgbOf(SHAREPIC_COLOR_HEX[color]);
    const t = Math.min(1, Math.max(0, y / canvas.height)) * (gradient.stops.length - 1);
    const k = Math.min(gradient.stops.length - 2, Math.floor(t));
    const [a, b] = [rgbOf(gradient.stops[k]!), rgbOf(gradient.stops[k + 1]!)].map((c) =>
      c.split(',').map(Number)
    );
    return a!.map((v, i) => Math.round(v + (b![i]! - v) * (t - k))).join(',');
  };
  const strip = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    side: SharepicTextSide
  ) => {
    const shape = rect(id, x, y, w, h, 'transparent');
    const ground = groundAt(y + h / 2);
    shape.fillGradient = {
      type: 'linear',
      angle: SCRIM_ANGLE[side],
      stops: SCRIM_EASE.map((t) => ({
        offset: t,
        color: `rgba(${ground},${(t * t * (3 - 2 * t)).toFixed(3)})`,
      })),
    };
    addShape(shape);
  };
  const depth = Math.round(box.width * STECKBRIEF.fade);
  const from = Math.max(0, box.y);
  const segments = 4;
  const segment = (canvas.height - from) / segments;
  for (let k = 0; k < segments; k++) {
    const y = from + k * segment;
    strip(`sc-steckbrief-fade-links-${k}`, box.x, y, depth, segment + 1, 'links');
    strip(
      `sc-steckbrief-fade-rechts-${k}`,
      box.x + box.width - depth,
      y,
      depth,
      segment + 1,
      'rechts'
    );
  }
  if (withTop) strip('sc-steckbrief-fade-oben', box.x, from, box.width, depth, 'oben');
}

/**
 * `steckbrief`: the greeting and the name in the right column beside the
 * face, the traits in two columns either side of the person, each with a
 * hand-drawn arrow that starts beside it and just touches the person,
 * clear of every text and the face (`placeArrow`).
 */
export function steckbriefAround(
  ctx: SlideCtx,
  around: SteckbriefScene,
  id: string,
  item: SteckbriefItem
): void {
  const {
    measure,
    brand,
    headFamily,
    isAt,
    canvas,
    out,
    onLight,
    textColor,
    addShape,
    text,
    fitLine,
  } = ctx;
  const { person, bg, bild, surface, swipeOn, kiText, kiTop, kiHeight } = around;
  if (!person) return;
  const W = canvas.width;
  const H = canvas.height;
  const colWidth = Math.round(W * STECKBRIEF.column);
  const family = headFamily;
  const ink = textColor;
  const lineHeight = 1.05;
  const measureLine = (l: string, size: number) => measure(l, size, family, 'normal');
  const wrapAt = (value: string, size: number, width: number) =>
    balancedWrap(value, width, (l) => measureLine(l, size));
  // The AI label owns the bottom-left corner, the sunflower the bottom-right.
  const floor = {
    links: kiText ? kiTop - 24 : H - MARGIN,
    rechts: H - (isAt ? MARGIN : STECKBRIEF.blume + 50),
  };

  // Greeting: small over the name, right-aligned beside the face, the waving hand right of the name.
  const grussSize = brand.fontSize.steckbriefGruss;
  const hand = STECKBRIEF.hand;
  const right = W - MARGIN;
  const nameWidth = Math.round(W * STECKBRIEF.nameWidth);
  const nameCap = brand.fontSize.steckbriefName;
  const nameSize = Math.min(nameCap, fitLine(item.name, nameCap, nameWidth, family));
  const greetHeight = grussSize * lineHeight + nameSize;
  const greetAt = bg.kind === 'foto' ? STECKBRIEF.greetAt.foto : STECKBRIEF.greetAt.frei;
  const greetTop = Math.round(H * greetAt - greetHeight / 2);

  const slots = steckbriefSlots(item.merkmale.length);
  const greetBottom = greetTop + greetHeight;
  /** A right-hand place the greeting covers moves just below it. */
  const topOf = (k: number) => {
    const top = Math.round(H * slots[k]!.top);
    return slots[k]!.side === 'rechts' && top > greetTop - 60 && top < greetBottom + 24
      ? greetBottom + 24
      : top;
  };
  // Beside the head a trait wraps narrower, so its text stays off hair and face.
  const outline = steckbriefOutline(person);
  const neckY = person.y + person.height * 0.6;
  const widthOf = (k: number, size: number) => {
    const top = topOf(k);
    const left = slots[k]!.side === 'links';
    let free = colWidth;
    for (let y = top; y <= Math.min(neckY, top + 2 * size * lineHeight); y += 10) {
      const span = outlineSpan(outline, y);
      if (span) free = Math.min(free, left ? span[0] - 24 - MARGIN : right - span[1] - 24);
    }
    if (free >= colWidth) return colWidth;
    // A word wider than the gap sets the width: a word to a line.
    const longest = Math.max(...item.merkmale[k]!.split(/\s+/).map((w) => measureLine(w, size)));
    return Math.min(colWidth, Math.ceil(Math.max(200, free, longest)));
  };
  /** Whether every trait fits its place: up to three lines, clear of the next one below. */
  const fitsAt = (size: number) =>
    slots.every((slot, k) => {
      const lines = wrapAt(item.merkmale[k]!, size, widthOf(k, size));
      const bottom = topOf(k) + lines.length * size * lineHeight;
      const below = [
        ...slots.flatMap((other, j) =>
          other.side === slot.side && other.top > slot.top ? [topOf(j)] : []
        ),
        ...(slot.side === 'rechts' && topOf(k) < greetTop ? [greetTop] : []),
        floor[slot.side],
      ];
      return lines.length <= 3 && bottom + size * 0.4 <= Math.min(...below);
    });
  let size = brand.fontSize.steckbriefTrait;
  while (size > 30 && !fitsAt(size)) size -= 2;

  const turn = (pivot: { x: number; y: number }, rotation: number, p: { x: number; y: number }) =>
    shapePoint(
      { x: pivot.x, y: pivot.y, rotation, scaleX: 1, scaleY: 1 },
      { x: p.x - pivot.x, y: p.y - pivot.y }
    );
  const step = size * lineHeight;
  const labels = item.merkmale.map((merkmal, k) => {
    const slot = slots[k]!;
    const left = slot.side === 'links';
    const lines = wrapAt(merkmal, size, widthOf(k, size));
    const y = topOf(k);
    const x = left ? MARGIN : right - colWidth;
    const rotation = ((k % 3) - 1) * 2;
    const pivot = { x, y };
    const dir = left ? 1 : -1;
    // Each line's ink, and the places a tail may start: beside a line, under the last, over the first.
    const ink = lines.map((l, i) => {
      const w = measureLine(l, size);
      return { x: left ? MARGIN : right - w, y: y + i * step, width: w, height: step };
    });
    const innerOf = (r: Box) => (left ? r.x + r.width : r.x);
    const first = ink[0]!;
    const last = ink[ink.length - 1]!;
    const design = bg.kind === 'foto' ? slot.foto : slot;
    const { target, anchor } = design;
    const prefer = {
      x: person.x + person.width * target.x,
      y: person.y + person.height * target.y,
    };
    const beside = ink.map((r) => ({ x: innerOf(r) + dir * 14, y: r.y + r.height / 2 }));
    const below = [
      { x: innerOf(last) - dir * Math.min(70, last.width / 3), y: last.y + last.height + 8 },
      { x: last.x + last.width / 2, y: last.y + last.height + 8 },
    ];
    const above = [
      { x: innerOf(first) - dir * Math.min(70, first.width / 3), y: first.y - 8 },
      { x: first.x + first.width / 2, y: first.y - 8 },
    ];
    const designedFrom =
      anchor === 'unten'
        ? below[0]!
        : anchor === 'oben'
          ? above[0]!
          : beside.reduce((a, b) => (Math.abs(b.y - prefer.y) < Math.abs(a.y - prefer.y) ? b : a));
    const froms =
      prefer.y > last.y + last.height
        ? [...below, ...beside, ...above]
        : prefer.y < first.y
          ? [...above, ...beside, ...below]
          : [...beside, ...below, ...above];
    return {
      lines,
      x,
      y,
      left,
      rotation,
      own: { rects: ink, pivot, rotation },
      request: {
        arrow: design.arrow,
        froms: froms.map((p) => turn(pivot, rotation, p)),
        prefer,
        designed: { from: turn(pivot, rotation, designedFrom), to: prefer, bow: design.bow },
      },
    };
  });

  const nameTop = greetTop + grussSize * lineHeight;
  const nameInk = measureLine(item.name, nameSize);
  const grussInk = measureLine(item.gruss, grussSize);
  const still = { pivot: { x: 0, y: 0 }, rotation: 0 };
  // The greeting keeps a wider berth than a trait: it is the slide's headline.
  const berth = 16;
  const corners: Box[] = [
    { x: right - grussInk, y: greetTop, width: grussInk, height: grussSize * lineHeight },
    { x: right - hand - 10 - nameInk, y: nameTop, width: nameInk + hand + 10, height: nameSize },
    { x: right - hand, y: nameTop + nameSize * 0.55 - hand / 2, width: hand, height: hand },
  ].map((r) => ({
    x: r.x - berth,
    y: r.y - berth,
    width: r.width + 2 * berth,
    height: r.height + 2 * berth,
  }));
  if (kiText) {
    const kiWidth =
      measure(kiText, KI_LABEL.fontSize, KI_LABEL.fontFamily, 'bold') + 2 * KI_LABEL.paddingX;
    corners.push({ x: KI_LABEL.margin, y: kiTop, width: kiWidth, height: kiHeight });
  }
  const blume = !isAt && !swipeOn;
  if (blume) {
    corners.push({
      x: W - MARGIN - STECKBRIEF.blume + 20,
      y: H - MARGIN - STECKBRIEF.blume + 20,
      width: STECKBRIEF.blume,
      height: STECKBRIEF.blume,
    });
  }
  const scene = {
    canvas,
    person,
    stroke: STECKBRIEF.stroke,
    gap: STECKBRIEF.arrowGap,
    minLength: STECKBRIEF.arrowMin,
    maxLength: STECKBRIEF.arrowMax,
    curlMin: STECKBRIEF.curlMin,
  };
  const arrows: PlacedArrow[] = [];
  labels.forEach((label, k) => {
    const obstacles = [
      { rects: corners, ...still },
      ...labels.flatMap((other, j) => (j === k ? [] : [other.own])),
    ];
    arrows.push(placeArrow({ ...label.request, own: label.own }, { ...scene, obstacles }, arrows));
  });

  // On a photo the text and the arrows keep a shadow.
  const overPhoto =
    surface === 'foto' || (bild && !bild.freisteller)
      ? { shadowColor: '#000000', shadowBlur: 12, shadowOffsetY: 2, shadowOpacity: 0.45 }
      : {};
  labels.forEach((label, k) => {
    text(`${id}-${k}`, label.lines.join('\n'), label.y, size, family, {
      type: 'header',
      x: label.x,
      width: colWidth,
      align: label.left ? 'left' : 'right',
      lineHeight,
      rotation: label.rotation,
      accent: null,
      marker: null,
      ...overPhoto,
    });
    const { type, pose } = arrows[k]!;
    addShape({
      ...createShape(type, pose.x, pose.y, ink, ink),
      id: `${id}-pfeil-${k}`,
      ...pose,
      strokeWidth: STECKBRIEF.stroke,
      ...overPhoto,
    });
  });

  text(`${id}-gruss`, item.gruss, greetTop, grussSize, family, {
    type: 'header',
    x: right - nameWidth - hand,
    width: nameWidth + hand,
    align: 'right',
    lineHeight,
    accent: null,
    marker: null,
    ...overPhoto,
  });
  text(`${id}-name`, item.name, nameTop, nameSize, family, {
    type: 'header',
    x: right - hand - 10 - nameWidth,
    width: nameWidth,
    align: 'right',
    lineHeight: 1,
    accent: null,
    marker: null,
    ...overPhoto,
  });
  addShape({
    ...createShape('hand-winken', right - hand / 2, nameTop + nameSize * 0.55, ink, ink),
    id: `${id}-winken`,
    width: hand,
    height: hand,
    rotation: -12,
    strokeWidth: 8,
    ...overPhoto,
  });

  // DE: the small white sunflower in the bottom-right corner, as the posts close.
  if (blume) {
    out.assetInstances.push({
      id: `${id}-blume`,
      assetId: onLight ? 'sunflower-green' : 'sunflower-weiss',
      x: W - MARGIN - STECKBRIEF.blume / 2 + 20,
      y: H - MARGIN - STECKBRIEF.blume / 2 + 20,
      scale: STECKBRIEF.blume / ASSET_TARGET_SIZE,
      rotation: 0,
      opacity: 1,
    });
    out.layerOrder.push(`${id}-blume`);
  }
}
