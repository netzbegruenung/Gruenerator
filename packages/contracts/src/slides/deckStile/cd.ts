/**
 * Stil `cd`: die offiziellen CD-Folien des Grünen Präsentations-CD. Titel,
 * Text, Zitat und Danke sind die vorhandenen Layouts aus `slideLayouts.ts`;
 * Liste, Kernsatz und Zahl stehen auf demselben Raster.
 */

import { type BrandLocale } from '../../brand/grueneBrand.js';
import { type FolieSpec, type FolienTypId } from '../folienTypen.js';
import { removeElement } from '../slideDeck.js';
import { slideKit, SlideBuilder, type SlideLayoutState } from '../slideLayouts.js';

import {
  applySlots,
  footer,
  listItems,
  renameElement,
  renderList,
  stoerer,
  STOERER_MAGENTA,
  textOf,
  type DeckStilCtx,
} from './shared.js';

const { M, W, inkFor } = slideKit;

/** Überschrift der Listen- und Textfolie: kleiner als im CD-Beispiel, damit 50 Zeichen zweizeilig passen. */
const HEAD = { y: 50, size: 96, width: 1680 } as const;

function titelFolie(b: SlideBuilder, folie: FolieSpec) {
  slideKit.titel(b, false);
  const s = folie.slots as { stoerer?: string };
  if (s.stoerer?.trim()) stoerer(b, s.stoerer.trim(), 1685, 800, STOERER_MAGENTA);
}

function listeFolie(b: SlideBuilder, folie: FolieSpec) {
  b.headline('folie-headline', '', M, HEAD.y, 1400, HEAD.size);
  renderList(b, listItems(folie, 'punkte'), { x: M, y: 280, width: 1400, size: 48, pitch: 118 });
  const s = folie.slots as { stoerer?: string };
  if (s.stoerer?.trim()) stoerer(b, s.stoerer.trim(), 1685, 230, STOERER_MAGENTA);
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
  textOf(b, 'folie-spalte-1').width = 1100;
}

function zitatFolie(b: SlideBuilder, folie: FolieSpec, locale: BrandLocale) {
  slideKit.zitat(b, false, locale);
  const s = folie.slots as { name?: string };
  b.text('folie-zitat-name', s.name ?? '', M, 930, 1400, 40, { type: 'subheader' });
}

function kernsatzFolie(b: SlideBuilder, folie: FolieSpec, locale: BrandLocale) {
  // Das Raster der Zitatfolie: Anführung, Zeile darüber, großer Satz.
  slideKit.zitat(b, false, locale);
  renameElement(b, 'folie-intro', 'folie-headline');
  renameElement(b, 'folie-zitat', 'folie-kernsatz');
  renderList(b, listItems(folie, 'punkte'), {
    x: M,
    y: 880,
    width: W - 2 * M,
    size: 40,
    pitch: 46,
  });
}

function zahlFolie(b: SlideBuilder) {
  b.text('folie-zahl', '', M, 240, W - 2 * M - 120, 300, {
    type: 'header',
    family: b.ink.headline,
    lineHeight: 1,
  });
  b.text('folie-zahl-text', '', M, 630, 1500, 56, { lineHeight: 1.25 });
  b.text('folie-quelle', '', M, 940, W - 2 * M - 120, 28);
}

function dankeFolie(b: SlideBuilder, locale: BrandLocale) {
  // „Vielen Dank“ (`folie-headline`) und die Zeile darunter (`folie-text`) bleiben wie im CD.
  slideKit.danke(b, locale);
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
      dankeFolie(b, ctx.locale);
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
    'folie-headline': { maxHeight: 370, minScale: 0.6 },
    'folie-text': { maxHeight: 560, minScale: 0.8 },
  },
  liste: { 'folie-headline': { maxHeight: 200, minScale: 0.6 } },
  text: {
    'folie-headline': { maxHeight: 200, minScale: 0.6 },
    'folie-spalte-1': { maxHeight: 700, minScale: 0.8 },
  },
  kernsatz: {
    'folie-headline': { maxHeight: 70, minScale: 0.6 },
    'folie-kernsatz': { maxHeight: 520, minScale: 0.6 },
  },
  zahl: {
    'folie-zahl': { maxHeight: 360, minScale: 0.6 },
    'folie-zahl-text': { maxHeight: 290, minScale: 0.7 },
  },
  zitat: { 'folie-zitat': { maxHeight: 560, minScale: 0.6 } },
  // „Vielen Dank“ steht bei y 330 (DE) bzw. 365 (AT), die Zeile darunter bei 600.
  danke: { 'folie-headline': { maxHeight: 235, minScale: 0.6 } },
};
