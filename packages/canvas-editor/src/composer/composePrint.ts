/**
 * Print spec → freeform canvas pages in a print format (business card front
 * and back, typo poster), the same output shape as `composeSharepic`, so the
 * editor, persistence and undo treat a print draft like any other freeform
 * canvas.
 *
 * Layouts follow the CD patterns (DE styleguide 2024 p. 26/32, AT CD 2026
 * p. 95) as the design lab rebuilt them (`free-design-lab/public/print.js`):
 * one type unit `u` = short trim side / 24, a margin of 1.6 u (DE, at least
 * 4 mm) or 6 % of the short side (AT). Planes are the page background, which
 * covers the whole canvas and so the bleed; text and logos stay inside the
 * margin, which lies inside the safe zone.
 *
 * Pure: no React, no Konva. Text is measured through the injected `measure`.
 */

import { getCanvasFormat, isPrintFormat } from '@ggraphic/editor/formats/index';
import { type TextAccent } from '@ggraphic/editor/utils/textUtils';
import {
  type PrintFormatId,
  type PrintSpec,
  type PrintStil,
  type PrintTypoSlots,
  type PrintVisitenkarteSlots,
  type PrintImpressum,
  printFotoSrc,
} from '@gruenerator/contracts';

import {
  AT_EMPHASIS_STYLE,
  DE_WORDMARK,
  defaultMeasure,
  LIME,
  SHAREPIC_COLOR_HEX,
  type MeasureText,
} from './chromeParts';
import { type ComposedSlide } from './composeSharepic';
import { brandFont } from './fontRole';
import { briefbogen, gemeindezeitung } from './printBriefbogenZeitung';
import { flyerA6, flyerFalz } from './printFlyer';
import {
  ART,
  BODY_LEADING,
  frame,
  HEAD_LEADING,
  impressumElement,
  impressumText,
  KLEE,
  layoutStack,
  page,
  placeStack,
  SAND,
  stackHeight,
  WHITE,
  withAccent,
  wordsFit,
  blockHeight,
  kontaktText,
  type Block,
  type Frame,
  type Page,
} from './printFrame';
import { plakatAt } from './printPlakatAt';
import { plakatDe } from './printPlakatDe';

import type { AdditionalText } from '@ggraphic/editor/configs/types';

export { PRINT_IMPRESSUM_ID } from './printFrame';

export interface ComposePrintOptions {
  measure?: MeasureText;
  /** Where a photo slot loads from; default the API's routes (`printFotoSrc`). */
  photoSrc?: (foto: string) => string;
}

export interface ComposedPrint {
  templateType: 'freeform' | 'freeform-at';
  format: PrintFormatId;
  /** One page per printed side, front first. */
  slides: ComposedSlide[];
}

/** The impressum element of a poster in `formatId`, at its standard position (for re-adding a deleted one). */
export function composePrintImpressum(
  formatId: string,
  isAt: boolean,
  text: string
): AdditionalText {
  const format = getCanvasFormat(formatId);
  if (!format || !isPrintFormat(format)) {
    throw new Error(`composePrintImpressum: ${formatId} is not a print format`);
  }
  return impressumElement(frame(format, isAt, defaultMeasure), text);
}

export function composePrint(spec: PrintSpec, options: ComposePrintOptions = {}): ComposedPrint {
  const format = getCanvasFormat(spec.format);
  if (!format || !isPrintFormat(format)) {
    throw new Error(`composePrint: ${spec.format} is not a print format`);
  }
  const isAt = spec.locale === 'de-AT';
  const f = frame(format, isAt, options.measure ?? defaultMeasure);
  let slides: ComposedSlide[];
  switch (spec.variante) {
    case 'visitenkarte':
      slides = isAt
        ? visitenkarteAt(f, spec.slots, spec.stil)
        : visitenkarteDe(f, spec.slots, spec.stil);
      break;
    case 'typo':
      slides = [typo(f, spec.slots, spec.impressum, spec.stil)];
      break;
    case 'geteilt':
    case 'overlay':
    case 'person':
      slides = [plakatAt(f, spec, options.photoSrc ?? printFotoSrc)];
      break;
    case 'flyer-falz':
      slides = flyerFalz(f, spec, options.photoSrc ?? printFotoSrc);
      break;
    case 'flyer-a6':
      slides = flyerA6(f, spec, options.photoSrc ?? printFotoSrc);
      break;
    case 'briefbogen':
      slides = briefbogen(f, spec);
      break;
    case 'gemeindezeitung':
      slides = gemeindezeitung(f, spec, options.photoSrc ?? printFotoSrc);
      break;
    default:
      slides = [plakatDe(f, spec, options.photoSrc ?? printFotoSrc)];
  }
  return { templateType: isAt ? 'freeform-at' : 'freeform', format: spec.format, slides };
}

// ── Business card ───────────────────────────────────────────────────────────

/** Size steps for content that does not fit: the type shrinks, never below the print minimums. */
const FIT_STEPS = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6];

/** Small and body type on a card: 0.62 u / 0.85 u, at least 7 pt / 8 pt. */
function cardType(f: Frame, fit: number) {
  return {
    klein: Math.max(0.62 * f.u * fit, f.pt(7)),
    text: Math.max(0.85 * f.u * fit, f.pt(8)),
  };
}

const isHoch = (f: Frame) => f.trim.height > f.trim.width;

/** The contact blocks of a card, one per filled slot, in reading order. */
function cardBlocks(
  f: Frame,
  slots: PrintVisitenkarteSlots,
  fit: number,
  width: number,
  ink: CardInk,
  align: 'left' | 'center'
): Block[] {
  const { theme, u } = f;
  const { klein, text } = cardType(f, fit);
  // AT upright: the name large over two lines, as on CD p. 95.
  const nameBase = (f.isAt && !isHoch(f) ? 1.7 : 2.4) * u * fit;
  const nameSize = wordsFit(f, slots.name, nameBase, width, theme.fonts.headline);
  const body = (id: string, value: string, before: number): Block => ({
    before,
    props: {
      id,
      text: value,
      type: 'body',
      fontSize: klein,
      ...brandFont(theme.fonts, 'body'),
      fontStyle: 'normal',
      fill: ink.body,
      lineHeight: BODY_LEADING,
      align,
    },
  });
  // DE: name and function one group (0.25 u), then the address group (1.2 u),
  // contacts 0.5 u below. AT: one centred stack, 0.9 u after the name.
  const groupGap = (f.isAt ? 0.9 : 1.2) * u * fit;
  const blocks: Block[] = [
    {
      before: 0,
      props: {
        id: 'pr-name',
        text: slots.name,
        type: 'header',
        fontSize: nameSize,
        ...brandFont(theme.fonts, 'headline'),
        fontStyle: 'normal',
        fill: ink.name,
        lineHeight: HEAD_LEADING[theme.locale],
        align,
      },
    },
  ];
  if (slots.funktion) {
    blocks.push(
      f.isAt
        ? body('pr-funktion', slots.funktion, groupGap)
        : {
            before: 0.25 * u * fit,
            props: {
              id: 'pr-funktion',
              text: slots.funktion,
              type: 'subheader',
              fontSize: text,
              ...brandFont(theme.fonts, 'body'),
              fontStyle: 'bold',
              fill: ink.funktion,
              lineHeight: BODY_LEADING,
              align,
            },
          }
    );
  }
  let next = f.isAt && slots.funktion ? 0 : groupGap;
  if (slots.organisation) {
    blocks.push(body('pr-organisation', slots.organisation, next));
    next = 0;
  }
  if (slots.adresse) {
    blocks.push(body('pr-adresse', slots.adresse, next));
    next = 0;
  }
  const kontakt = kontaktText(slots);
  if (kontakt) {
    const after = f.isAt ? 0 : 0.5 * u * fit;
    blocks.push(body('pr-kontakt', kontakt, next === 0 ? after : next));
  }
  return blocks;
}

interface CardInk {
  name: string;
  funktion: string;
  body: string;
}

/**
 * An upright card split in two (CD p. 32 / p. 95): the head from `headTop`
 * down, the contact group ending at `restBottom`, at least a group gap apart.
 * False, placing nothing, when that does not fit at full size; the caller
 * then stacks as on a landscape card.
 */
function splitCard(
  p: Page,
  f: Frame,
  blocks: Block[],
  x: number,
  width: number,
  headTop: number,
  restBottom: number
): boolean {
  // The head: the name, in DE with the function; the rest is the contact group.
  const headIds = f.isAt ? ['pr-name'] : ['pr-name', 'pr-funktion'];
  const head = blocks.filter((b) => headIds.includes(b.props.id));
  const rest = blocks.filter((b) => !head.includes(b));
  if (!rest.length) return false;
  const headHeight = stackHeight(f, head, width);
  const restHeight = stackHeight(f, rest, width);
  if (headTop + headHeight + 1.2 * f.u > restBottom - restHeight) return false;
  placeStack(p, f, head, x, headTop, width);
  placeStack(p, f, rest, x, restBottom - restHeight, width);
  return true;
}

/** DE colourways (CD p. 11/32): front ground, ink, logo; the back's ground. */
const DE_KARTE = {
  tanne: {
    front: SHAREPIC_COLOR_HEX.tanne,
    ink: { name: WHITE, funktion: SHAREPIC_COLOR_HEX.mint, body: WHITE },
    logo: DE_WORDMARK.farbe,
    back: SHAREPIC_COLOR_HEX.tanne,
  },
  klee: {
    front: KLEE,
    ink: { name: WHITE, funktion: SHAREPIC_COLOR_HEX.mint, body: WHITE },
    logo: DE_WORDMARK.farbe,
    back: KLEE,
  },
  // Sand with Tanne type; the sunflower never stands on Sand (p. 21), so the back stays Tanne.
  sand: {
    front: SAND,
    ink: { name: SHAREPIC_COLOR_HEX.tanne, funktion: KLEE, body: SHAREPIC_COLOR_HEX.tanne },
    logo: DE_WORDMARK.black,
    back: SHAREPIC_COLOR_HEX.tanne,
  },
} as const;

/**
 * DE (CD p. 32): front Tanne, name in the headline face, function in mint,
 * address and contacts small, the colour logo bottom-right; back Tanne with a
 * large yellow sunflower cut by the edges. `klee` and `sand` change the
 * grounds; `schlicht` puts only the word mark on the back.
 */
function visitenkarteDe(
  f: Frame,
  slots: PrintVisitenkarteSlots,
  stil: PrintStil | undefined
): ComposedSlide[] {
  const { inner, trim, u } = f;
  const look = stil === 'klee' || stil === 'sand' ? DE_KARTE[stil] : DE_KARTE.tanne;
  const { ink } = look;

  const front = page(look.front);
  const logoW = 6 * u;
  const logoH = (logoW * ART.deLogo.h) / ART.deLogo.w;
  const logoTop = inner.y + inner.height - logoH;
  const hoch = isHoch(f);
  const split =
    hoch &&
    splitCard(
      front,
      f,
      cardBlocks(f, slots, 1, inner.width, ink, 'left'),
      inner.x,
      inner.width,
      inner.y,
      logoTop - 1.2 * u
    );
  if (!split) {
    // Full width while the column ends above the logo; beside it otherwise.
    const narrow = inner.width - logoW - u;
    let chosen = { blocks: cardBlocks(f, slots, 1, inner.width, ink, 'left'), width: inner.width };
    for (const fit of FIT_STEPS) {
      const wide = cardBlocks(f, slots, fit, inner.width, ink, 'left');
      if (stackHeight(f, wide, inner.width) <= logoTop - 0.5 * u - inner.y) {
        chosen = { blocks: wide, width: inner.width };
        break;
      }
      const beside = cardBlocks(f, slots, fit, narrow, ink, 'left');
      chosen = { blocks: beside, width: narrow };
      if (stackHeight(f, beside, narrow) <= inner.height) break;
    }
    placeStack(front, f, chosen.blocks, inner.x, inner.y, chosen.width);
  }
  front.asset('pr-logo', look.logo, inner.x + inner.width - logoW / 2, logoTop + logoH / 2, logoW);

  const back = page(look.back);
  if (stil === 'schlicht') {
    const w = 0.6 * f.shortSide;
    back.asset(
      'pr-logo-rueck',
      DE_WORDMARK.farbe,
      trim.x + trim.width / 2,
      trim.y + trim.height / 2,
      w
    );
    return [front.out, back.out];
  }
  // Back: the lab's flower, relative to the trim box (quer: cut top and
  // right; hoch: cut left, right and bottom).
  const blume = hoch
    ? { left: -0.3, top: 0.22, width: 1.5 }
    : { left: 0.28, top: -0.22, width: 0.9 };
  const w = blume.width * trim.width;
  const h = (w * ART.sunflower.h) / ART.sunflower.w;
  back.asset(
    'pr-blume',
    'sunflower',
    trim.x + (blume.left * trim.width + w / 2),
    trim.y + blume.top * trim.height + h / 2,
    Math.max(w, h)
  );
  return [front.out, back.out];
}

/**
 * AT (CD p. 95): front Dunkelgrün with only the white logo in the middle;
 * back white, everything centred in Dunkelgrün — no sunflower. `hellgruen`
 * takes the alternative green for the front (drawn as its glow, see
 * `surfaceGlow`), `weiss` swaps the grounds
 * (green logo on white, white type on green), `gruen` keeps both sides green.
 */
function visitenkarteAt(
  f: Frame,
  slots: PrintVisitenkarteSlots,
  stil: PrintStil | undefined
): ComposedSlide[] {
  const { inner, trim, theme } = f;
  const green = theme.colors.primary;
  const frontGround =
    stil === 'hellgruen' ? theme.colors.secondary : stil === 'weiss' ? WHITE : green;
  const backGround = stil === 'weiss' || stil === 'gruen' ? green : WHITE;
  const inkColor = backGround === WHITE ? green : WHITE;

  const front = page(frontGround);
  front.asset(
    'pr-logo',
    frontGround === WHITE ? 'gruene-at-logo-gruen' : 'gruene-at-logo-weiss',
    trim.x + trim.width / 2,
    trim.y + trim.height / 2,
    0.34 * f.shortSide
  );

  const back = page(backGround);
  const ink = { name: inkColor, funktion: inkColor, body: inkColor };
  const full = cardBlocks(f, slots, 1, inner.width, ink, 'center');
  if (
    isHoch(f) &&
    splitCard(
      back,
      f,
      full,
      inner.x,
      inner.width,
      inner.y + 0.12 * inner.height,
      inner.y + 0.92 * inner.height
    )
  ) {
    return [front.out, back.out];
  }
  let blocks = full;
  for (const fit of FIT_STEPS) {
    blocks = cardBlocks(f, slots, fit, inner.width, ink, 'center');
    if (stackHeight(f, blocks, inner.width) <= inner.height) break;
  }
  const height = stackHeight(f, blocks, inner.width);
  placeStack(
    back,
    f,
    blocks,
    inner.x,
    inner.y + Math.max(0, (inner.height - height) / 2),
    inner.width
  );
  return [front.out, back.out];
}

// ── Typo poster ─────────────────────────────────────────────────────────────

/**
 * DE (CD p. 26/44): Tanne (`klee`: Klee), a cut sunflower top-right, kicker, a huge headline
 * whose accent is lime (colour only, no marker box), subline, the web address
 * large, sender and logo at the bottom. AT: Dunkelgrün, the accent in yellow
 * Vollkorn Black Italic, logo bottom-right, no sunflower. Both: the
 * V.i.S.d.P. / Impressum turned −90° in the left margin.
 */
function typo(
  f: Frame,
  slots: PrintTypoSlots,
  impressum: PrintImpressum | null,
  stil: PrintStil | undefined
): ComposedSlide {
  const { inner, trim, theme, u, isAt } = f;
  const p = page(isAt ? theme.colors.primary : stil === 'klee' ? KLEE : SHAREPIC_COLOR_HEX.tanne);
  const head = theme.fonts.headline;
  const hervor = isAt ? WHITE : SHAREPIC_COLOR_HEX.mint;
  const accent: TextAccent = isAt
    ? {
        fill: theme.colors.accent,
        fontFamily: theme.fonts.quoteEmphasis,
        fontStyle: AT_EMPHASIS_STYLE,
      }
    : { fill: LIME };
  const leading = HEAD_LEADING[theme.locale];
  const h3 = 1.7 * u;
  const gap = 1.2 * u;

  // A text starting above the flower's bottom edge (plus a gap) ends before
  // its left edge, as in the lab; below it the column runs full width.
  let widthAt = (_y: number) => inner.width;
  if (!isAt) {
    // Drawn first, so the text sits on it.
    const w = 0.4 * trim.width;
    const h = (w * ART.sunflower.h) / ART.sunflower.w;
    const cx = trim.x + trim.width * 1.14 - w / 2;
    const cy = trim.y - 0.08 * trim.height + h / 2;
    const size = Math.max(w, h);
    p.asset('pr-blume', 'sunflower', cx, cy, size);
    const flowerBottom = cy + size / 2;
    const beside = cx - size / 2 - u - inner.x;
    widthAt = (y) => (y < flowerBottom + gap ? beside : inner.width);
  }

  // Footer, bottom-up: logo bottom-right, the sender beside it, the web above.
  const logoW = isAt ? 0.18 * f.shortSide : 6 * u;
  const art = isAt ? ART.atLogo : ART.deLogo;
  const logoH = (logoW * art.h) / art.w;
  const bottom = inner.y + inner.height;
  const footer: Block[] = [];
  let rowHeight = logoH;
  const absenderWidth = inner.width - logoW - u;
  if (slots.absender) {
    const absender: Block = {
      before: 0,
      props: {
        id: 'pr-absender',
        text: slots.absender,
        type: 'body',
        fontSize: Math.max(0.85 * u, f.pt(8)),
        ...brandFont(theme.fonts, 'body'),
        fontStyle: 'normal',
        fill: hervor,
        lineHeight: BODY_LEADING,
      },
    };
    const height = blockHeight(f, absender, absenderWidth);
    rowHeight = Math.max(rowHeight, height);
    p.text({ ...absender.props, x: inner.x, y: bottom - height, width: absenderWidth });
  }
  let footerTop = bottom - rowHeight;
  if (slots.web) {
    const one = f.measure(slots.web, h3, head, 'normal');
    const size = one > inner.width ? (h3 * inner.width) / one : h3;
    const web: Block = {
      before: 0,
      props: {
        id: 'pr-web',
        text: slots.web,
        type: 'subheader',
        fontSize: size,
        ...brandFont(theme.fonts, 'headline'),
        fontStyle: 'normal',
        fill: WHITE,
        lineHeight: leading,
      },
    };
    footerTop -= 0.6 * u + blockHeight(f, web, inner.width);
    footer.push(web);
  }
  placeStack(p, f, footer, inner.x, footerTop, inner.width);

  // The block: kicker, headline, subline (0.6 u apart), shrinking the headline
  // until it fits between the top and the footer.
  const blockFor = (headSize: number): Block[] => {
    const blocks: Block[] = [];
    if (slots.dachzeile) {
      blocks.push({
        before: 0,
        props: {
          id: 'pr-dachzeile',
          text: slots.dachzeile,
          type: 'subheader',
          fontSize: wordsFit(f, slots.dachzeile, h3, inner.width, head),
          ...brandFont(theme.fonts, 'headline'),
          fontStyle: 'normal',
          fill: hervor,
          lineHeight: leading,
        },
      });
    }
    blocks.push({
      before: 0.6 * u,
      props: {
        id: 'pr-headline',
        text: withAccent(slots.headline, slots.akzent),
        type: 'header',
        fontSize: headSize,
        ...brandFont(theme.fonts, 'headline'),
        fontStyle: 'normal',
        fill: WHITE,
        lineHeight: leading,
        accent,
      },
    });
    if (slots.subline) {
      blocks.push({
        before: 0.6 * u,
        props: {
          id: 'pr-subline',
          text: slots.subline,
          type: 'subheader',
          fontSize: wordsFit(f, slots.subline, h3, inner.width, head),
          ...brandFont(theme.fonts, 'headline'),
          fontStyle: 'normal',
          fill: WHITE,
          lineHeight: leading,
        },
      });
    }
    return blocks;
  };
  // Fitted at the highest start, where the most text runs beside the flower;
  // any lower start only widens texts, so the block stays as tall or shrinks.
  const top = inner.y + gap;
  const room = footerTop - gap - top;
  const heightAt = (blocks: Block[], y: number) => layoutStack(f, blocks, y, widthAt).bottom - y;
  let headSize = 5 * u;
  while (headSize > 1.7 * u && heightAt(blockFor(headSize), top) > room) headSize *= 0.97;
  const blocks = blockFor(headSize);
  // The lab's spacers: 1.2 parts above the block, 1 part below. Moving down
  // can widen a text and shorten the block; settle in a few rounds.
  let y = top;
  for (let round = 0; round < 4; round++) {
    const free = Math.max(0, room - heightAt(blocks, y));
    y = top + (free * 1.2) / 2.2;
  }
  // A wider text may take its full size back and grow; then start at the top.
  if (y + heightAt(blocks, y) > top + room) y = top;
  for (const item of layoutStack(f, blocks, y, widthAt).items) p.text(item);

  p.asset(
    'pr-logo',
    isAt ? 'gruene-at-logo-weiss' : DE_WORDMARK.white,
    inner.x + inner.width - logoW / 2,
    bottom - logoH / 2,
    Math.max(logoW, logoH)
  );

  if (impressum) p.text(impressumElement(f, impressumText(impressum)));
  return p.out;
}
