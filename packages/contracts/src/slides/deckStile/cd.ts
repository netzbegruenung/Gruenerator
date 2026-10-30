/**
 * Stil `cd`: die offiziellen CD-Folien des Grünen Präsentations-CD. Titel,
 * Text, Zitat und Danke sind die vorhandenen Layouts aus `slideLayouts.ts`;
 * Liste, Kernsatz und Zahl stehen auf demselben Raster.
 */

import { type BrandLocale } from '../../brand/grueneBrand.js';
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
  textOf,
  type DeckStilCtx,
} from './shared.js';

const { M, W, inkFor } = slideKit;

/** Überschrift der Listen- und Textfolie: kleiner als im CD-Beispiel, damit 50 Zeichen zweizeilig passen. */
const HEAD = { y: 50, size: 96, width: 1680 } as const;

function titelFolie(b: SlideBuilder, folie: FolieSpec) {
  slideKit.titel(b, false);
  // Beamergröße (Entwurf A: 46 px); der Kit-Wert 38 ist auf dem Projektor zu klein.
  textOf(b, 'folie-text').fontSize = 46;
  const s = folie.slots as { stoerer?: string };
  if (s.stoerer?.trim()) stoerer(b, s.stoerer.trim(), 1685, 800, STOERER_MAGENTA);
}

/**
 * Punkte in Beamergröße (Entwurf A: 58 px). Bis fünf Punkte stehen 140 auseinander,
 * sechs rücken zusammen, damit der letzte samt Zelle über der Fußzeile endet.
 */
const LISTE = { y: 280, size: 58, pitch: 140, cell: 120, bottom: 1028 } as const;

function listeFolie(b: SlideBuilder, folie: FolieSpec) {
  b.headline('folie-headline', '', M, HEAD.y, 1400, HEAD.size);
  const items = listItems(folie, 'punkte');
  const room = Math.floor((LISTE.bottom - LISTE.y - LISTE.cell) / Math.max(1, items.length - 1));
  renderList(b, items, {
    x: M,
    y: LISTE.y,
    width: 1400,
    size: LISTE.size,
    pitch: Math.min(LISTE.pitch, room),
  });
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
  const body = textOf(b, 'folie-spalte-1');
  body.width = 1400;
  body.fontSize = 52;
}

function zitatFolie(b: SlideBuilder, folie: FolieSpec, locale: BrandLocale) {
  slideKit.zitat(b, false, locale);
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
  headWidth: 1360,
  satzY: 310,
  satzHeight: 470,
  punkteY: 800,
  punkteSize: 48,
  punktePitch: 64,
} as const;

function kernsatzFolie(b: SlideBuilder, folie: FolieSpec, locale: BrandLocale) {
  slideKit.zitat(b, false, locale);
  const quote = textOf(b, 'folie-anfuehrung');
  quote.fontSize = locale === 'de-AT' ? 440 : 600;
  quote.width = quote.fontSize;
  quote.x = W - M - quote.fontSize * 0.55;
  quote.y = 20;
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
    'folie-headline': { maxHeight: 370, minScale: 0.5 },
    'folie-text': { maxHeight: 560, minScale: 0.8 },
  },
  liste: {
    'folie-punkt-*': { maxHeight: LISTE.cell, minScale: 0.7 },
    'folie-headline': { maxHeight: 200, minScale: 0.6 },
  },
  text: {
    'folie-headline': { maxHeight: 200, minScale: 0.6 },
    'folie-spalte-1': { maxHeight: 680, minScale: 0.8 },
  },
  kernsatz: {
    'folie-punkt-*': { maxHeight: 60, minScale: 0.7 },
    'folie-headline': { maxHeight: 70, minScale: 0.6 },
    'folie-kernsatz': { maxHeight: KERNSATZ.satzHeight, minScale: 0.6 },
  },
  zahl: {
    'folie-zahl': { maxHeight: 360, minScale: 0.5 },
    'folie-zahl-text': { maxHeight: 290, minScale: 0.7 },
  },
  zitat: { 'folie-zitat': { maxHeight: 560, minScale: 0.6 } },
  // „Vielen Dank“ steht bei y 330 (DE) bzw. 365 (AT), die Zeile darunter bei 600.
  danke: { 'folie-headline': { maxHeight: 235, minScale: 0.5 } },
};
