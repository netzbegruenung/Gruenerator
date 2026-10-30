/**
 * Stil `aussage` (Entwurf D): eine Aussage pro Folie, Weiß und Tanne im
 * Wechsel nach `ctx.index` (gerade Weiß, ungerade Tanne), Störer in Grasgrün,
 * Balken in Grasgrün über den Stichpunkten. Die Liste und die Text-, Zahl-
 * und Danke-Folie zeigt der Entwurf nicht: Die Liste ordnet ihre Punkte als
 * Spalten mit Balken wie die „three“-Reihe, die übrigen nehmen den Rand 110
 * und die großen Schriften des Entwurfs.
 */

import { type FolieSpec, type FolienTypId } from '../folienTypen.js';
import { SlideBuilder, type SlideLayoutState } from '../slideLayouts.js';

import {
  finishFolie,
  fs,
  head,
  listItems,
  logoOben,
  stilInk,
  stoerer,
  stoererOf,
  textOf,
  tonesOf,
  type DeckStilCtx,
} from './shared.js';

import { type DeckStilBox } from './index.js';

const X = 110;
const AREA_W = 1700;
const GAP = 60;

export function buildAussage(folie: FolieSpec, ctx: DeckStilCtx): SlideLayoutState {
  const t = tonesOf(ctx.locale);
  const light = ctx.index % 2 === 0;
  const b = new SlideBuilder(stilInk(ctx.locale, light, light ? '#FFFFFF' : t.tanne), null);
  const size = (n: number) => fs(ctx.locale, n);
  const störer = stoererOf(folie);
  const akzent = b.ink.accent?.fill ?? t.tanne;

  /** Eine Reihe Stichpunkte, je ein Grasgrün-Balken darüber. */
  const reihe = (items: string[], y: number, textSize: number, cols: number, rowPitch: number) => {
    const tw = (AREA_W - (cols - 1) * GAP) / cols;
    items.forEach((item, i) => {
      const x = X + (i % cols) * (tw + GAP);
      const ry = y + Math.floor(i / cols) * rowPitch;
      b.shape(`folie-balken-${i + 1}`, 'rect', x + tw / 2, ry + 4, tw, 8, t.gras);
      b.text(`folie-punkt-${i + 1}`, item, x, ry + 30, tw, textSize, { lineHeight: 1.25 });
    });
  };

  switch (folie.typ) {
    case 'titel':
      head(b, 'folie-headline', X, 380, 1700, size(240));
      b.text('folie-text', '', X + 6, 860, 1500, 44, { fill: akzent });
      if (störer) stoerer(b, störer, 1595, 305, t.gras);
      break;
    case 'liste': {
      head(b, 'folie-headline', X, 110, 1300, size(110));
      const items = listItems(folie, 'punkte');
      reihe(items, 470, 44, items.length === 4 ? 2 : 3, 300);
      if (störer) stoerer(b, störer, 1595, 305, t.gras);
      break;
    }
    case 'text':
      head(b, 'folie-headline', X, 110, 1700, size(80), akzent);
      b.text('folie-spalte-1', '', X, 300, 1500, 54, { lineHeight: 1.35 });
      break;
    case 'kernsatz':
      head(b, 'folie-headline', X, 110, 1700, size(72), akzent);
      head(b, 'folie-kernsatz', X, 250, 1700, size(150));
      {
        const items = listItems(folie, 'punkte');
        reihe(items, 830, 44, Math.max(items.length, 1), 0);
      }
      break;
    case 'zahl':
      head(b, 'folie-zahl', X, 200, 1700, size(400), akzent);
      b.text('folie-zahl-text', '', X + 6, 650, 1500, 56, { lineHeight: 1.25 });
      b.text('folie-quelle', '', X + 6, 930, 1500, 30, { fill: akzent });
      break;
    case 'zitat':
      b.text('folie-intro', '', X + 6, 110, 1500, 50, { type: 'subheader', fill: akzent });
      head(b, 'folie-zitat', X, 220, 1600, size(150));
      b.text('folie-zitat-name', '', X + 6, 820, 1500, 44, { fill: akzent });
      break;
    case 'danke':
      logoOben(b, ctx.locale, X, b.ink.logoAssetId);
      head(b, 'folie-headline', X, 300, 1700, size(250), undefined, 'Vielen Dank');
      b.text('folie-text', 'für eure Aufmerksamkeit!', X + 6, 640, 1500, 60, {
        type: 'subheader',
        family: b.ink.headline,
        fill: akzent,
      });
      b.text('folie-kontakt', '', X + 6, 780, 1400, 28, { lineHeight: 1.3 });
      break;
  }
  const state = finishFolie(b, folie, ctx, 'aussage');
  // Grasgrün trägt weiße Schrift schlecht. DE: Dunkeltanne wie im Entwurf (auf #00CC4F gut über 4,5:1).
  // AT: Dunkelgrün hielte auf Hellgrün #56AF31 nur etwa 2,5:1, Schwarz aus dem Brandpack hält über 8:1.
  if (störer) textOf(b, 'folie-stoerer-text').fill = ctx.locale === 'de-AT' ? '#000000' : t.dunkel;
  return state;
}

export const AUSSAGE_BOXES: Record<FolienTypId, Record<string, DeckStilBox>> = {
  titel: {
    'folie-headline': { maxHeight: 470, minScale: 0.6 },
    'folie-text': { maxHeight: 130, minScale: 0.8 },
  },
  liste: {
    'folie-punkt-*': { maxHeight: 200, minScale: 0.7 },
    'folie-headline': { maxHeight: 330, minScale: 0.6 },
  },
  text: {
    'folie-headline': { maxHeight: 170, minScale: 0.6 },
    'folie-spalte-1': { maxHeight: 680, minScale: 0.8 },
  },
  kernsatz: {
    'folie-punkt-*': { maxHeight: 140, minScale: 0.7 },
    'folie-headline': { maxHeight: 120, minScale: 0.6 },
    'folie-kernsatz': { maxHeight: 540, minScale: 0.6 },
  },
  zahl: {
    'folie-zahl': { maxHeight: 400, minScale: 0.5 },
    'folie-zahl-text': { maxHeight: 250, minScale: 0.7 },
  },
  zitat: { 'folie-zitat': { maxHeight: 580, minScale: 0.6 } },
  danke: { 'folie-headline': { maxHeight: 330, minScale: 0.6 } },
};
