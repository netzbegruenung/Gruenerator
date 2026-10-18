/**
 * Flyers. DE (2024 p. 29/30): DIN lang, a roll fold on A4 landscape; outside
 * the inner flap, the back panel with contact and Störer, the title panel;
 * inside three panels of sections and the list. AT (2026 p. 94): A6, the
 * cover with the photo, the back with two columns of copy.
 *
 * Panel photos are cover-fitted user images, so each stays replaceable.
 */
import { type PrintSpec } from '@gruenerator/contracts';

import { type TextAccent } from '../utils/textUtils';

import { AT_EMPHASIS_STYLE, LIME, SHAREPIC_COLOR_HEX } from './chromeParts';
import { type ComposedSlide } from './composeSharepic';
import {
  ART,
  BODY_LEADING,
  blume,
  fitStack,
  HEAD_LEADING,
  impressumElement,
  impressumText,
  kontaktText,
  mm,
  page,
  placeStack,
  rect,
  SAND,
  scrim,
  stackHeight,
  stoerer,
  WHITE,
  withAccent,
  type Block,
  type Frame,
  type Page,
  type PhotoSrc,
  type Rect,
} from './printFrame';

type FlyerFalzSpec = Extract<PrintSpec, { variante: 'flyer-falz' }>;
type FlyerA6Spec = Extract<PrintSpec, { variante: 'flyer-a6' }>;

const TANNE = SHAREPIC_COLOR_HEX.tanne;
const MINT = SHAREPIC_COLOR_HEX.mint;

/** The roll fold's panels, left to right, in mm: outside 97 / 100 / 100, inside 100 / 100 / 97. */
const PANELS = { aussen: [0, 97, 197, 297], innen: [0, 100, 200, 297] } as const;

/** A panel in canvas px; the outer panels run into the bleed. */
function panel(f: Frame, side: 'aussen' | 'innen', i: number): Rect {
  const edges = PANELS[side];
  const left = i === 0 ? 0 : f.trim.x + mm(f, edges[i]!);
  const right = i === 2 ? f.format.width : f.trim.x + mm(f, edges[i + 1]!);
  return { x: left, y: 0, width: right - left, height: f.format.height };
}

/** A photo filling `r`, replaceable like any picture. */
function foto(p: Page, id: string, foto: string, r: Rect, src: PhotoSrc) {
  p.image({
    id,
    src: src(foto),
    fileName: foto,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    rotation: 0,
    scale: 1,
    opacity: 1,
    fit: 'cover',
  });
}

/** A section: heading in GrueneType, copy in PT Sans (DE) / Gotham (AT), both `ink`. */
function abschnitt(
  f: Frame,
  id: string,
  ueberschrift: string | undefined,
  text: string,
  size: number,
  ink: string,
  before: number
): Block[] {
  const blocks: Block[] = [];
  if (ueberschrift) {
    blocks.push({
      before,
      props: {
        id: `${id}-titel`,
        text: ueberschrift,
        type: 'subheader',
        fontSize: size,
        fontFamily: f.theme.fonts.headline,
        fontStyle: 'normal',
        fill: ink,
        lineHeight: HEAD_LEADING[f.theme.locale],
      },
    });
  }
  blocks.push({
    before: blocks.length ? 0.4 * size : before,
    props: {
      id,
      text: text.replace(/\n\s*\n/g, '\n'),
      type: 'body',
      fontSize: Math.max(0.55 * size, f.pt(7)),
      fontFamily: f.theme.fonts.body,
      fontStyle: 'normal',
      fill: ink,
      lineHeight: BODY_LEADING,
    },
  });
  return blocks;
}

/** The blocks fitted into `r` less `pad`, placed from its top. */
function fill(
  p: Page,
  f: Frame,
  r: Rect,
  pad: number,
  build: (size: number) => Block[],
  start: number
) {
  const width = r.width - 2 * pad;
  const blocks = fitStack(f, build, start, width, r.height - 2 * pad);
  placeStack(p, f, blocks, r.x + pad, r.y + pad, width);
  return r.y + pad + stackHeight(f, blocks, width);
}

/** Inside the trim box: a panel that runs into the bleed starts at the trim edge for its content. */
function inTrim(f: Frame, r: Rect): Rect {
  const x = Math.max(r.x, f.trim.x);
  const y = Math.max(r.y, f.trim.y);
  const right = Math.min(r.x + r.width, f.trim.x + f.trim.width);
  const bottom = Math.min(r.y + r.height, f.trim.y + f.trim.height);
  return { x, y, width: right - x, height: bottom - y };
}

export function flyerFalz(f: Frame, spec: FlyerFalzSpec, src: PhotoSrc): ComposedSlide[] {
  const s = spec.slots;
  const pad = mm(f, 8);
  const heading = f.pt(17);
  const [titelFoto, ...innenFotos] = s.fotos;
  const abschnitte = [...s.abschnitte];

  // ── Outside ────────────────────────────────────────────────────────────────
  const aussen = page(SAND);
  // Inner flap: a photo above, the first section on Sand.
  const klappe = inTrim(f, panel(f, 'aussen', 0));
  const klappeFoto = innenFotos[2] ?? titelFoto!;
  const fotoH = klappe.height * 0.4;
  foto(
    aussen,
    'pr-foto-klappe',
    klappeFoto,
    { ...panel(f, 'aussen', 0), height: f.trim.y + fotoH },
    src
  );
  const erster = abschnitte.shift();
  if (erster) {
    fill(
      aussen,
      f,
      { ...klappe, y: klappe.y + fotoH, height: klappe.height - fotoH },
      pad,
      (size) => abschnitt(f, 'pr-klappe', erster.ueberschrift, erster.text, size, TANNE, 0),
      heading
    );
  }

  // Back panel: contact on Sand, the Störer, Tanne with the cut flower at the foot.
  const ruecken = inTrim(f, panel(f, 'aussen', 1));
  const fussH = ruecken.height * 0.28;
  aussen.shape(
    rect(
      'pr-fuss',
      { ...panel(f, 'aussen', 1), y: f.trim.y + ruecken.height - fussH, height: f.format.height },
      TANNE
    )
  );
  aussen.asset(
    'pr-blume',
    'sunflower',
    ruecken.x + ruecken.width / 2,
    f.trim.y + f.trim.height + fussH * 0.15,
    ruecken.width * 0.85
  );
  const kontakt = kontaktText(s.kontakt);
  const kontaktZeilen = [
    s.kontakt.organisation,
    s.kontakt.name,
    s.kontakt.funktion,
    s.kontakt.adresse,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
  const kontaktBottom = fill(
    aussen,
    f,
    { ...ruecken, height: ruecken.height - fussH },
    pad,
    (size) => [
      ...abschnitt(f, 'pr-kontakt', 'Kontakt', kontaktZeilen || ' ', size, TANNE, 0),
      ...(kontakt
        ? [
            {
              before: 0.4 * size,
              props: {
                id: 'pr-kontakt-wege',
                text: kontakt,
                type: 'body' as const,
                fontSize: Math.max(0.5 * size, f.pt(7)),
                fontFamily: f.theme.fonts.body,
                fontStyle: 'normal' as const,
                fill: TANNE,
                lineHeight: BODY_LEADING,
              },
            },
          ]
        : []),
    ],
    heading
  );
  if (s.stoerer) {
    const r = 0.21 * ruecken.width;
    const y = Math.min(kontaktBottom + r, ruecken.y + ruecken.height - fussH - r * 0.3);
    stoerer(aussen, f, 'pr-stoerer', s.stoerer, ruecken.x + ruecken.width - pad - r, y, r);
  }

  // Title panel: the photo over the whole panel, the statement low over a scrim.
  const titelVoll = panel(f, 'aussen', 2);
  const titel = inTrim(f, titelVoll);
  foto(aussen, 'pr-foto-titel', titelFoto!, titelVoll, src);
  scrim(
    aussen,
    'pr-scrim',
    { ...titelVoll, y: titelVoll.height * 0.45, height: titelVoll.height * 0.55 },
    '0,38,26',
    0.85
  );
  blume(aussen, f, (titel.x + titel.width - f.trim.x) / f.trim.width, 0.52, titel.width * 0.6);
  const titelSize = f.pt(30);
  const webSize = f.pt(20);
  const webY = titel.y + titel.height - pad - webSize;
  if (s.web) {
    aussen.text({
      id: 'pr-web',
      text: s.web,
      type: 'subheader',
      x: titel.x + pad,
      y: webY,
      width: titel.width - 2 * pad,
      fontSize: webSize,
      fontFamily: f.theme.fonts.headline,
      fontStyle: 'normal',
      fill: WHITE,
      lineHeight: 1,
      align: 'center',
    });
  }
  const accent: TextAccent = { fill: LIME };
  const titelWidth = titel.width - 2 * pad;
  const titelBlocks = fitStack(
    f,
    (size) => [
      {
        before: 0,
        props: {
          id: 'pr-headline',
          text: withAccent(s.headline, s.akzent),
          type: 'header' as const,
          fontSize: size,
          fontFamily: f.theme.fonts.headline,
          fontStyle: 'normal' as const,
          fill: WHITE,
          lineHeight: HEAD_LEADING['de-DE'],
          accent,
        },
      },
      ...(s.subline
        ? [
            {
              before: 0.25 * size,
              props: {
                id: 'pr-subline',
                text: s.subline,
                type: 'subheader' as const,
                fontSize: 0.45 * size,
                fontFamily: f.theme.fonts.headline,
                fontStyle: 'normal' as const,
                fill: MINT,
                lineHeight: HEAD_LEADING['de-DE'],
              },
            },
          ]
        : []),
    ],
    titelSize,
    titelWidth,
    titel.height * 0.4
  );
  const titelH = stackHeight(f, titelBlocks, titelWidth);
  placeStack(aussen, f, titelBlocks, titel.x + pad, webY - pad - titelH, titelWidth);
  if (spec.impressum) aussen.text(impressumElement(f, impressumText(spec.impressum)));

  // ── Inside ─────────────────────────────────────────────────────────────────
  const innen = page(TANNE);
  const [links, mitte, rechts] = [0, 1, 2].map((i) => panel(f, 'innen', i)) as [Rect, Rect, Rect];
  // Left: a photo on Tanne, a section in white.
  const linksTrim = inTrim(f, links);
  let y = linksTrim.y;
  if (innenFotos[0]) {
    const h = linksTrim.height * 0.36;
    foto(innen, 'pr-foto-innen-1', innenFotos[0], { ...links, height: f.trim.y + h }, src);
    y += h;
  }
  const zweiter = abschnitte.shift();
  if (zweiter) {
    fill(
      innen,
      f,
      { ...linksTrim, y, height: linksTrim.y + linksTrim.height - y },
      pad,
      (size) => abschnitt(f, 'pr-innen-1', zweiter.ueberschrift, zweiter.text, size, WHITE, 0),
      heading
    );
  }
  // Middle: Sand with the next sections, a photo at the foot.
  const mitteTrim = inTrim(f, mitte);
  const mitteFotoH = innenFotos[1] ? mitteTrim.height * 0.36 : 0;
  innen.shape(
    rect(
      'pr-sand',
      { ...mitte, height: f.format.height - (innenFotos[1] ? f.trim.y + mitteFotoH : 0) },
      SAND
    )
  );
  if (innenFotos[1]) {
    foto(
      innen,
      'pr-foto-innen-2',
      innenFotos[1],
      { ...mitte, y: f.trim.y + mitteTrim.height - mitteFotoH, height: f.format.height },
      src
    );
  }
  const mittig = abschnitte.splice(0, 2);
  if (mittig.length) {
    fill(
      innen,
      f,
      { ...mitteTrim, height: mitteTrim.height - mitteFotoH },
      pad,
      (size) =>
        mittig.flatMap((a, i) =>
          abschnitt(f, `pr-innen-2-${i}`, a.ueberschrift, a.text, size, TANNE, i ? 0.8 * size : 0)
        ),
      heading
    );
  }
  // Right: the list in GrueneType, the cut flower, the last section.
  const rechtsTrim = inTrim(f, rechts);
  blume(innen, f, 1, 0.45, rechtsTrim.width * 0.55);
  const rest = abschnitte.shift();
  fill(
    innen,
    f,
    { ...rechtsTrim, width: rechtsTrim.width * 0.8 },
    pad,
    (size) => [
      ...(s.liste
        ? [
            {
              before: 0,
              props: {
                id: 'pr-liste-titel',
                text: s.liste.ueberschrift,
                type: 'subheader' as const,
                fontSize: size,
                fontFamily: f.theme.fonts.headline,
                fontStyle: 'normal' as const,
                fill: WHITE,
                lineHeight: HEAD_LEADING['de-DE'],
              },
            },
            {
              before: 0.5 * size,
              props: {
                id: 'pr-liste',
                text: s.liste.punkte.map((punkt) => `• ${punkt}`).join('\n'),
                type: 'subheader' as const,
                fontSize: 0.7 * size,
                fontFamily: f.theme.fonts.headline,
                fontStyle: 'normal' as const,
                fill: WHITE,
                lineHeight: 1.5,
              },
            },
          ]
        : []),
      ...(rest
        ? abschnitt(
            f,
            'pr-innen-3',
            rest.ueberschrift,
            rest.text,
            size,
            WHITE,
            s.liste ? 0.9 * size : 0
          )
        : []),
    ],
    heading
  );
  return [aussen.out, innen.out];
}

// ── AT flyer A6 ────────────────────────────────────────────────────────────────

/** Gotham Ultra white with the yellow Vollkorn accent. */
function atHeadline(
  f: Frame,
  id: string,
  text: string,
  akzent: string | undefined,
  size: number,
  align: 'left' | 'center'
): Block {
  const accent: TextAccent = {
    fill: f.theme.colors.accent,
    fontFamily: f.theme.fonts.quoteEmphasis,
    fontStyle: AT_EMPHASIS_STYLE,
  };
  return {
    before: 0,
    props: {
      id,
      text: withAccent(text, akzent),
      type: 'header',
      fontSize: size,
      fontFamily: f.theme.fonts.headline,
      fontStyle: 'normal',
      fill: WHITE,
      lineHeight: HEAD_LEADING['de-AT'],
      accent,
      align,
    },
  };
}

export function flyerA6(f: Frame, spec: FlyerA6Spec, src: PhotoSrc): ComposedSlide[] {
  const { inner, trim } = f;
  const s = spec.slots;
  const X = f.margin;
  const quer = trim.width > trim.height;
  const { primary: dunkel, secondary: hell } = f.theme.colors;
  const logoW = 3 * X;
  const logoH = (logoW * ART.atLogo.h) / ART.atLogo.w;

  // Cover: the photo above the seam, the logo on it, the headline below
  // (upright on Dunkelgrün, centred; landscape on Hellgrün, left).
  const front = page(quer ? hell : dunkel);
  const seam = trim.y + trim.height * (quer ? 0.45 : 0.5);
  foto(front, 'pr-foto', s.foto, { x: 0, y: 0, width: f.format.width, height: seam }, src);
  front.asset(
    'pr-logo',
    'gruene-at-logo-weiss',
    quer ? inner.x + logoW / 2 : trim.x + trim.width / 2,
    seam,
    logoW
  );
  const top = seam + logoH / 2 + X * 0.5;
  const headBlocks = fitStack(
    f,
    (size) => [atHeadline(f, 'pr-headline', s.headline, s.akzent, size, quer ? 'left' : 'center')],
    0.13 * f.shortSide,
    inner.width,
    inner.y + inner.height - top
  );
  const headH = stackHeight(f, headBlocks, inner.width);
  placeStack(
    front,
    f,
    headBlocks,
    inner.x,
    quer ? inner.y + inner.height - headH : top + (inner.y + inner.height - top - headH) / 2,
    inner.width
  );
  if (s.stoerer) {
    const r = 0.13 * f.shortSide;
    stoerer(front, f, 'pr-stoerer', s.stoerer, inner.x + inner.width - r, seam, r);
  }

  // Back: the headline and two columns; upright on Hellgrün with the photo at
  // the foot, landscape on Dunkelgrün.
  const back = page(quer ? dunkel : hell);
  const r = s.rueckseite;
  const fotoH = !quer && r.foto ? trim.height * 0.36 : 0;
  if (!quer && r.foto) {
    foto(
      back,
      'pr-foto-rueck',
      r.foto,
      { x: 0, y: trim.y + trim.height - fotoH, width: f.format.width, height: f.format.height },
      src
    );
  }
  const bottom = fotoH ? trim.y + trim.height - fotoH - X * 0.5 : inner.y + inner.height;
  const gap = X * 0.5;
  const colWidth = (inner.width - gap) / 2;
  const fitted = fitStack(
    f,
    (size) => [atHeadline(f, 'pr-rueck-headline', r.headline, r.akzent, size, 'left')],
    0.1 * f.shortSide,
    inner.width,
    (bottom - inner.y) * 0.4
  );
  const headlineH = stackHeight(f, fitted, inner.width);
  placeStack(back, f, fitted, inner.x, inner.y, inner.width);
  const colTop = inner.y + headlineH + X * 0.6;
  r.abschnitte.forEach((a, i) => {
    const blocks = fitStack(
      f,
      (size) => abschnitt(f, `pr-spalte-${i + 1}`, a.ueberschrift, a.text, size, WHITE, 0),
      f.pt(13),
      colWidth,
      bottom - colTop
    );
    placeStack(back, f, blocks, inner.x + i * (colWidth + gap), colTop, colWidth);
  });
  if (spec.impressum) back.text(impressumElement(f, impressumText(spec.impressum)));
  return [front.out, back.out];
}
