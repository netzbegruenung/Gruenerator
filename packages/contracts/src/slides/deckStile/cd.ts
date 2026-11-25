/**
 * Stil `cd`: die offiziellen CD-Folien des Grünen Präsentations-CD. Titel,
 * Text, Zitat und Danke sind die vorhandenen Layouts aus `slideLayouts.ts`;
 * Liste, Kernsatz und Zahl stehen auf demselben Raster.
 */

import { type BrandLocale } from '../../brand/grueneBrand.js';
import { LIST_BOX_KEY, type FlowSet } from '../fitText.js';
import { type FolieSpec, type FolienTypId } from '../folienTypen.js';
import { removeElement } from '../slideDeckBasics.js';
import { slideKit, SlideBuilder, type SlideLayoutState } from '../slideLayouts.js';

import {
  applySlots,
  footer,
  listItems,
  renameElement,
  renderList,
  stoerer,
  STOERER_MAGENTA,
  SYMBOLE,
  SYMBOLE_BOXES,
  symbole,
  symboleFlows,
  textOf,
  tonesOf,
  type DeckStilCtx,
  bildFolie,
  BILD_BOXES,
} from './shared.js';

const { M, W, inkFor } = slideKit;

/**
 * Überschrift der Inhaltsfolien: 120 px (gut 6 % der Breite), zweizeilig für 50 Zeichen.
 * Neben dem Störer bleibt sie schmaler, sonst reicht sie bis vor das Zeichen oben rechts.
 */
const HEAD = { y: 60, size: 120, width: 1640, narrow: 1400 } as const;

/** Wo der Inhalt unter der Überschrift endet: Luft über der Fußzeile (y 1028). */
const CONTENT_BOTTOM = 970;

/** Titelfolie: Headline und Unterzeile als Block in der Mitte, wie in S.33. */
const TITEL = { size: 220, width: 1500, subSize: 52, subWidth: 1400 } as const;

function titelFolie(b: SlideBuilder, folie: FolieSpec) {
  slideKit.titel(b, false);
  const head = textOf(b, 'folie-headline');
  head.fontSize = TITEL.size;
  head.width = TITEL.width;
  // Ohne Messer: Platz für zwei Zeilen Headline, die Unterzeile darunter.
  head.y = 200;
  const sub = textOf(b, 'folie-text');
  sub.fontSize = TITEL.subSize;
  sub.width = TITEL.subWidth;
  sub.y = 700;
  const s = folie.slots as { stoerer?: string };
  if (s.stoerer?.trim()) stoerer(b, s.stoerer.trim(), 1685, 800, STOERER_MAGENTA);
}

/**
 * Punkte in Beamergröße: wenige Punkte größer (bis 76 px), sechs bei 60 px. Wo sie
 * stehen, setzt der Fluss nach gemessener Höhe (`CD_FLOWS`); die y-Werte hier gelten
 * nur ohne Messer.
 */
const LISTE = { y: 300, cell: 200 } as const;

const listSize = (n: number) => (n <= 3 ? 76 : n === 4 ? 68 : 60);

function listeFolie(b: SlideBuilder, folie: FolieSpec) {
  const s = folie.slots as { stoerer?: string };
  const withStoerer = !!s.stoerer?.trim();
  const width = withStoerer ? HEAD.narrow : HEAD.width;
  b.headline('folie-headline', '', M, HEAD.y, width, HEAD.size);
  const items = listItems(folie, 'punkte');
  const size = listSize(items.length);
  renderList(b, items, {
    x: M,
    y: LISTE.y,
    width,
    size,
    pitch: Math.min(
      Math.round(size * 1.25 * 1.6),
      Math.floor((CONTENT_BOTTOM - LISTE.y) / Math.max(1, items.length))
    ),
  });
  if (withStoerer) stoerer(b, s.stoerer!.trim(), 1685, 230, STOERER_MAGENTA);
}

/** Drei bis vier Kreise in Grasgrün auf dem Grün des CD; Überschrift wie die der Liste, eine Stufe kleiner. */
function symboleFolie(b: SlideBuilder, folie: FolieSpec, locale: BrandLocale) {
  b.headline('folie-headline', '', M, HEAD.y, HEAD.width, 110);
  const t = tonesOf(locale);
  symbole(b, folie, { circle: t.gras, dunkel: t.dunkel });
}

function textFolie(b: SlideBuilder) {
  slideKit.textfolie(b);
  // Eine Spalte, der Platz der zweiten gehört dem Text; Störer gibt es hier nicht.
  for (const id of ['folie-spalte-2', 'folie-stoerer', 'folie-stoerer-text']) {
    removeElement(b.state, id);
  }
  const head = textOf(b, 'folie-headline');
  head.fontSize = HEAD.size;
  head.width = HEAD.width;
  head.y = HEAD.y;
  // Eine breite Spalte bei 58 px, Zeilenabstand 130 % wie im Styleguide (S.14).
  const body = textOf(b, 'folie-spalte-1');
  body.width = 1500;
  body.fontSize = 58;
  body.lineHeight = 1.3;
  body.y = 320;
}

function zitatFolie(b: SlideBuilder, folie: FolieSpec, locale: BrandLocale) {
  slideKit.zitat(b, false, locale);
  // Die Anführung des CD-Layouts (1000 px) überragte den Satz; 60 % lassen ihm die Bühne.
  const quote = textOf(b, 'folie-anfuehrung');
  quote.fontSize = Math.round(quote.fontSize * 0.6);
  quote.width = quote.fontSize;
  quote.x = M - quote.fontSize * 0.06;
  quote.y = 30;
  const s = folie.slots as { name?: string };
  b.text('folie-zitat-name', s.name ?? '', M, 930, 1400, 40, { type: 'subheader' });
}

/**
 * Kernsatz auf dem Raster der Zitatfolie, aber mit der Anführung oben rechts:
 * links oben stand sie über der Zeile darüber (die Web-Schrift setzt den Glyphen
 * tiefer als die OTF, Live-Test 30.10.). Darunter bis zu drei Stichpunkte in
 * Beamergröße, mit Luft über der Fußzeile.
 */
const KERNSATZ = {
  headY: 120,
  headWidth: 1600,
  satzY: 310,
  satzHeight: 470,
  punkteY: 780,
  punkteSize: 52,
  punktePitch: 70,
} as const;

function kernsatzFolie(b: SlideBuilder, folie: FolieSpec, locale: BrandLocale) {
  slideKit.zitat(b, false, locale);
  // Ein Kernsatz ist eine eigene Botschaft, kein Zitat: ohne Anführung, sonst
  // unterscheidet ihn nichts von der Zitatfolie (Design-Review 22.11.).
  removeElement(b.state, 'folie-anfuehrung');
  renameElement(b, 'folie-intro', 'folie-headline');
  const head = textOf(b, 'folie-headline');
  head.y = KERNSATZ.headY;
  head.width = KERNSATZ.headWidth;
  renameElement(b, 'folie-zitat', 'folie-kernsatz');
  textOf(b, 'folie-kernsatz').y = KERNSATZ.satzY;
  renderList(b, listItems(folie, 'punkte'), {
    x: M,
    y: KERNSATZ.punkteY,
    width: W - 2 * M,
    size: KERNSATZ.punkteSize,
    pitch: KERNSATZ.punktePitch,
  });
}

/** Die Zahl groß und im Akzent (der eine Akzent dieser Folie), die Quelle direkt unter dem Text. */
function zahlFolie(b: SlideBuilder) {
  b.text('folie-zahl', '', M, 160, W - 2 * M - 120, 400, {
    type: 'header',
    family: b.ink.headline,
    lineHeight: 1,
    ...(b.ink.accent ? { fill: b.ink.accent.fill } : {}),
  });
  b.text('folie-zahl-text', '', M, 600, 1500, 60, { lineHeight: 1.25 });
  b.text('folie-quelle', '', M, 900, W - 2 * M - 120, 40);
}

function dankeFolie(b: SlideBuilder, folie: FolieSpec, locale: BrandLocale) {
  // „Vielen Dank“ (`folie-headline`) und die Zeile darunter (`folie-text`) bleiben wie im CD.
  slideKit.danke(b, locale);
  // Ohne Kontaktblock bleibt die linke Spalte leer: dann stehen Dank und Zeile in der
  // Spalte des Logos statt als zweite Insel rechts daneben.
  const s = folie.slots as { kontakt?: string };
  if (!s.kontakt?.trim()) {
    const head = textOf(b, 'folie-headline');
    head.x = M;
    head.width = W - 2 * M;
    const line = textOf(b, 'folie-text');
    line.x = M;
    line.width = W - 2 * M;
    delete line.align;
  }
}

export function buildCd(folie: FolieSpec, ctx: DeckStilCtx): SlideLayoutState {
  const b = new SlideBuilder(inkFor(ctx.locale, 'dunkel'), null);
  switch (folie.typ) {
    case 'titel':
      titelFolie(b, folie);
      break;
    case 'liste':
      listeFolie(b, folie);
      break;
    case 'symbole':
      symboleFolie(b, folie, ctx.locale);
      break;
    case 'text':
      textFolie(b);
      break;
    case 'kernsatz':
      kernsatzFolie(b, folie, ctx.locale);
      break;
    case 'zahl':
      zahlFolie(b);
      break;
    case 'zitat':
      zitatFolie(b, folie, ctx.locale);
      break;
    case 'danke':
      dankeFolie(b, folie, ctx.locale);
      break;
    case 'bild':
      bildFolie(b, folie);
      break;
  }
  applySlots(b, folie);
  slideKit.mark(b);
  footer(b, ctx);
  b.state.deckStil = 'cd';
  b.state.notes = folie.notes?.trim() ?? '';
  return b.state;
}

/** Wie viel Platz ein Textelement hat, bevor es schrumpfen muss (Aufgabe 4), und bis wohin. */
export const CD_BOXES: Record<
  FolienTypId,
  Record<string, { maxHeight: number; minScale: number }>
> = {
  titel: {
    'folie-headline': { maxHeight: 470, minScale: 0.5 },
    'folie-text': { maxHeight: 240, minScale: 0.8 },
    'folie-stoerer-text': { maxHeight: 140, minScale: 0.6 },
  },
  liste: {
    'folie-punkt-*': { maxHeight: LISTE.cell, minScale: 0.7 },
    'folie-headline': { maxHeight: 260, minScale: 0.6 },
    'folie-stoerer-text': { maxHeight: 140, minScale: 0.6 },
  },
  symbole: {
    ...SYMBOLE_BOXES,
    'folie-headline': { maxHeight: SYMBOLE.headBottom - HEAD.y, minScale: 0.6 },
  },
  text: {
    'folie-headline': { maxHeight: 260, minScale: 0.6 },
    'folie-spalte-1': { maxHeight: 620, minScale: 0.8 },
  },
  kernsatz: {
    // Eine Zeile à 52 px (65 hoch): bei 60 schrumpfte jeder Stichpunkt auf 46 px.
    'folie-punkt-*': { maxHeight: 70, minScale: 0.7 },
    'folie-headline': { maxHeight: 70, minScale: 0.6 },
    'folie-kernsatz': { maxHeight: KERNSATZ.satzHeight, minScale: 0.6 },
  },
  zahl: {
    'folie-zahl': { maxHeight: 420, minScale: 0.5 },
    'folie-zahl-text': { maxHeight: 290, minScale: 0.7 },
  },
  zitat: { 'folie-zitat': { maxHeight: 560, minScale: 0.6 } },
  // „Vielen Dank“ steht bei y 330 (DE) bzw. 365 (AT), die Zeile darunter bei 600.
  danke: { 'folie-headline': { maxHeight: 235, minScale: 0.5 } },
  bild: BILD_BOXES,
};

/**
 * Die senkrechten Flüsse je Folientyp (`fitSlideTexts`): nach dem Einpassen stehen
 * die Texte nach gemessener Höhe untereinander, mittig im Bereich unter der
 * Überschrift. Ohne Messer gelten die y-Werte der Builder.
 */
/** Text und Liste hängen an der Überschrift; mittig schwebend wirkten sie losgelöst. */
const underHead = { id: 'folie-headline', gap: 100 } as const;

export const CD_FLOWS: Partial<Record<FolienTypId, FlowSet>> = {
  titel: {
    ids: ['folie-headline', 'folie-text'],
    top: 120,
    bottom: 960,
    align: 'center',
    gapEm: 0.3,
    gapAfter: { 'folie-headline': 36 },
  },
  liste: {
    ids: [LIST_BOX_KEY],
    top: 260,
    below: underHead,
    bottom: CONTENT_BOTTOM,
    align: 'top',
    gapEm: 0.8,
  },
  symbole: symboleFlows(CONTENT_BOTTOM),
  text: {
    ids: ['folie-spalte-1'],
    top: 260,
    below: underHead,
    bottom: CONTENT_BOTTOM,
    align: 'top',
    gapEm: 0,
  },
  kernsatz: {
    ids: ['folie-headline', 'folie-kernsatz', LIST_BOX_KEY],
    top: 240,
    bottom: CONTENT_BOTTOM,
    align: 'center',
    gapEm: 0.35,
    gapAfter: { 'folie-headline': 40, 'folie-kernsatz': 70 },
  },
  zahl: {
    ids: ['folie-zahl', 'folie-zahl-text', 'folie-quelle'],
    top: 120,
    bottom: CONTENT_BOTTOM,
    align: 'center',
    gapEm: 0,
    gapAfter: { 'folie-zahl': 40, 'folie-zahl-text': 50 },
  },
  zitat: {
    ids: ['folie-intro', 'folie-zitat', 'folie-zitat-name'],
    top: 340,
    bottom: CONTENT_BOTTOM,
    align: 'center',
    gapEm: 0.3,
    gapAfter: { 'folie-intro': 30, 'folie-zitat': 50 },
  },
  danke: {
    ids: ['folie-headline', 'folie-text'],
    top: 300,
    bottom: 940,
    align: 'center',
    gapEm: 0.2,
  },
};
