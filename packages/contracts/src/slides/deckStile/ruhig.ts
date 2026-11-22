/**
 * Stil `ruhig` (Entwurf A): Tanne, eine Spalte, große Schrift, Lime-Punkte.
 * Maße aus den Entwürfen (1920er-Koordinaten). Text-, Kernsatz-, Zahl- und
 * Danke-Folie zeigt der Entwurf nicht: sie nehmen denselben Rand (110), die
 * Überschriftengrösse der Listenfolie und die große Schrift der Titel-/Zitatfolie.
 */

import { LIST_BOX_KEY, type FlowSpec } from '../fitText.js';
import { type FolieSpec, type FolienTypId } from '../folienTypen.js';
import { SlideBuilder, type SlideLayoutState } from '../slideLayouts.js';

import {
  finishFolie,
  fs,
  head,
  listItems,
  logoOben,
  renderList,
  stilInk,
  stoerer,
  stoererOf,
  STOERER_MAGENTA,
  tonesOf,
  type DeckStilCtx,
  bildFolie,
  BILD_BOXES,
} from './shared.js';

import { type DeckStilBox } from './index.js';

const X = 110;
/** Mitte der Lime-Marke unter der Oberkante ihres Punkts: die Mitte der ersten Zeile (64 px, Zeilenhöhe 1,25). */
const MARKE_DY = 40;

export function buildRuhig(folie: FolieSpec, ctx: DeckStilCtx): SlideLayoutState {
  const t = tonesOf(ctx.locale);
  const b = new SlideBuilder(stilInk(ctx.locale, false, t.tanne), null);
  const size = (n: number) => fs(ctx.locale, n);
  const störer = stoererOf(folie);
  switch (folie.typ) {
    case 'titel':
      head(b, 'folie-headline', X, 250, 1440, size(250));
      b.text('folie-text', '', X + 6, 780, 1500, 46, { fill: t.lime });
      if (störer) stoerer(b, störer, 1700, 190, STOERER_MAGENTA);
      break;
    case 'liste': {
      head(b, 'folie-headline', X, 110, 1400, size(130));
      const items = listItems(folie, 'punkte');
      renderList(b, items, { x: 186, y: 340, width: 1360, size: 64, pitch: 110, prefix: '' });
      // Lime-Punkte vor jedem Punkt; der Fluss setzt sie mit ihrem Punkt (`RUHIG_FLOWS`).
      items.forEach((_, i) => {
        b.shape(`folie-marke-${i + 1}`, 'circle', 132, 340 + i * 110 + MARKE_DY, 32, 32, t.lime);
      });
      if (störer) stoerer(b, störer, 1700, 190, STOERER_MAGENTA);
      break;
    }
    case 'text':
      head(b, 'folie-headline', X, 110, 1700, size(130));
      b.text('folie-spalte-1', '', X, 340, 1500, 60, { lineHeight: 1.35 });
      break;
    case 'kernsatz':
      b.text('folie-headline', '', X + 6, 110, 1700, 52, {
        type: 'header',
        family: b.ink.headline,
        fill: t.lime,
        lineHeight: 1,
      });
      head(b, 'folie-kernsatz', X, 200, 1700, size(140));
      renderList(b, listItems(folie, 'punkte'), {
        x: X + 6,
        y: 830,
        width: 1700,
        size: 52,
        pitch: 66,
      });
      break;
    case 'zahl':
      head(b, 'folie-zahl', X, 200, 1700, size(380), t.lime);
      b.text('folie-zahl-text', '', X + 6, 640, 1500, 62, { lineHeight: 1.25 });
      b.text('folie-quelle', '', X + 6, 940, 1500, 30, { fill: t.lime });
      break;
    case 'zitat':
      b.text('folie-intro', '', X + 6, 110, 1500, 50, { type: 'subheader', fill: t.lime });
      // Entwurf: Zitat 170 bei (110, 260), 1500 breit, Quelle bei y 760.
      head(b, 'folie-zitat', X, 260, 1500, size(170));
      b.text('folie-zitat-name', '', X + 6, 760, 1500, 44, { fill: t.lime });
      break;
    case 'danke':
      logoOben(b, ctx.locale, X, b.ink.logoAssetId);
      head(b, 'folie-headline', X, 300, 1700, size(250), undefined, 'Vielen Dank');
      b.text('folie-text', 'für eure Aufmerksamkeit!', X + 6, 660, 1500, 60, {
        type: 'subheader',
        family: b.ink.headline,
        fill: t.lime,
      });
      b.text('folie-kontakt', '', X + 6, 780, 1200, 28, { lineHeight: 1.3 });
      break;
    case 'bild':
      bildFolie(b, folie);
      break;
  }
  return finishFolie(b, folie, ctx, 'ruhig');
}

export const RUHIG_BOXES: Record<FolienTypId, Record<string, DeckStilBox>> = {
  titel: {
    'folie-headline': { maxHeight: 500, minScale: 0.6 },
    'folie-text': { maxHeight: 200, minScale: 0.8 },
  },
  liste: {
    // Zwei Zeilen à 64 px; wo sie stehen und ob die Liste passt, regelt der Fluss.
    'folie-punkt-*': { maxHeight: 165, minScale: 0.65 },
    'folie-headline': { maxHeight: 220, minScale: 0.6 },
  },
  text: {
    'folie-headline': { maxHeight: 220, minScale: 0.6 },
    'folie-spalte-1': { maxHeight: 640, minScale: 0.8 },
  },
  kernsatz: {
    'folie-punkt-*': { maxHeight: 70, minScale: 0.7 },
    'folie-headline': { maxHeight: 80, minScale: 0.6 },
    'folie-kernsatz': { maxHeight: 620, minScale: 0.6 },
  },
  zahl: {
    'folie-zahl': { maxHeight: 400, minScale: 0.5 },
    'folie-zahl-text': { maxHeight: 250, minScale: 0.7 },
  },
  zitat: { 'folie-zitat': { maxHeight: 480, minScale: 0.5 } },
  danke: { 'folie-headline': { maxHeight: 330, minScale: 0.6 } },
  bild: BILD_BOXES,
};

/** Texte nach gemessener Höhe statt auf festen y-Werten (`fitSlideTexts`). */
const underHead = { id: 'folie-headline', gap: 70 } as const;

export const RUHIG_FLOWS: Partial<Record<FolienTypId, FlowSpec>> = {
  titel: {
    ids: ['folie-headline', 'folie-text'],
    top: 120,
    bottom: 960,
    align: 'center',
    gapEm: 0.3,
    gapAfter: { 'folie-headline': 50 },
  },
  liste: {
    ids: [LIST_BOX_KEY],
    top: 280,
    below: underHead,
    bottom: 970,
    align: 'top',
    gapEm: 0.6,
    follow: { 'folie-marke-': { anchor: 'top', dy: MARKE_DY } },
  },
  text: {
    ids: ['folie-spalte-1'],
    top: 280,
    below: underHead,
    bottom: 970,
    align: 'top',
    gapEm: 0,
  },
  kernsatz: {
    ids: ['folie-headline', 'folie-kernsatz', LIST_BOX_KEY],
    top: 100,
    bottom: 970,
    align: 'center',
    gapEm: 0.35,
    gapAfter: { 'folie-headline': 40, 'folie-kernsatz': 70 },
  },
  zahl: {
    ids: ['folie-zahl', 'folie-zahl-text', 'folie-quelle'],
    top: 100,
    bottom: 970,
    align: 'center',
    gapEm: 0,
    gapAfter: { 'folie-zahl': 40, 'folie-zahl-text': 50 },
  },
  zitat: {
    ids: ['folie-intro', 'folie-zitat', 'folie-zitat-name'],
    top: 100,
    bottom: 970,
    align: 'center',
    gapEm: 0,
    gapAfter: { 'folie-intro': 40, 'folie-zitat': 50 },
  },
};
