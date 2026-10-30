/**
 * Stil `kacheln` (Entwurf C): Dunkeltanne, Tanne-Kacheln mit großer Nummer,
 * große Zahl in Grasgrün. Text-, Kernsatz-, Zitat- und Danke-Folie zeigt der
 * Entwurf nicht: Sie legen den Inhalt auf eine Tanne-Fläche im Kachelraster
 * (110 Rand, 30 Abstand, 28er Ecken fehlen: Formen kennen keinen Radius).
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
  STOERER_MAGENTA,
  tonesOf,
  type DeckStilCtx,
} from './shared.js';

import { type DeckStilBox } from './index.js';

const X = 110;
const AREA_W = 1700;
const GAP = 30;
const WHITE = '#FFFFFF';

export function buildKacheln(folie: FolieSpec, ctx: DeckStilCtx): SlideLayoutState {
  const t = tonesOf(ctx.locale);
  const b = new SlideBuilder(stilInk(ctx.locale, false, t.dunkel), null);
  const size = (n: number) => fs(ctx.locale, n);
  const störer = stoererOf(folie);

  const flaeche = (id: string, y: number, h: number) => {
    b.shape(id, 'rect', X + AREA_W / 2, y + h / 2, AREA_W, h, t.tanne);
  };

  switch (folie.typ) {
    case 'titel':
      head(b, 'folie-headline', X, 200, 1400, size(230), t.grasText);
      b.text('folie-text', '', X + 6, 700, 1500, 46);
      if (störer) stoerer(b, störer, 1700, 330, STOERER_MAGENTA);
      break;
    case 'liste': {
      head(b, 'folie-headline', X, 100, 1300, size(110));
      const items = listItems(folie, 'punkte');
      const n = items.length;
      const cols = n === 4 ? 2 : 3;
      const tw = (AREA_W - (cols - 1) * GAP) / cols;
      const th = 300;
      items.forEach((_, i) => {
        const x = X + (i % cols) * (tw + GAP);
        const y = 300 + Math.floor(i / cols) * (th + GAP);
        const big = n > 1 && (i === 0 || i === n - 1);
        b.shape(
          `folie-kachel-${i + 1}`,
          'rect',
          x + tw / 2,
          y + th / 2,
          tw,
          th,
          big ? t.klee : t.tanne
        );
        b.text(
          `folie-kachelnr-${i + 1}`,
          String(i + 1).padStart(2, '0'),
          x + 40,
          y + 40,
          200,
          size(96),
          {
            type: 'header',
            family: b.ink.headline,
            fill: t.lime,
            lineHeight: 1,
          }
        );
      });
      items.forEach((item, i) => {
        const x = X + (i % cols) * (tw + GAP);
        const y = 300 + Math.floor(i / cols) * (th + GAP);
        // Entwurf setzt den Text unten in die Kachel; hier fest bei +150, damit zwei Zeilen à 44 px passen.
        b.text(`folie-punkt-${i + 1}`, item, x + 40, y + 150, tw - 80, 44, { lineHeight: 1.25 });
      });
      if (störer) stoerer(b, störer, 1700, 155, STOERER_MAGENTA);
      break;
    }
    case 'text':
      head(b, 'folie-headline', X, 100, 1700, size(110));
      flaeche('folie-kachel-text', 300, 630);
      b.text('folie-spalte-1', '', X + 40, 340, AREA_W - 80, 44, { lineHeight: 1.4 });
      break;
    case 'kernsatz': {
      b.text('folie-headline', '', X + 6, 100, 1700, 60, {
        type: 'header',
        family: b.ink.headline,
        fill: t.lime,
        lineHeight: 1,
      });
      flaeche('folie-kachel-satz', 200, 560);
      head(b, 'folie-kernsatz', X + 50, 240, AREA_W - 100, size(100));
      const items = listItems(folie, 'punkte');
      const n = Math.max(items.length, 1);
      const tw = (AREA_W - (n - 1) * GAP) / n;
      items.forEach((item, i) => {
        const x = X + i * (tw + GAP);
        b.shape(`folie-kachel-${i + 1}`, 'rect', x + tw / 2, 865, tw, 150, t.tanne);
        b.text(`folie-punkt-${i + 1}`, item, x + 30, 895, tw - 60, 32, { lineHeight: 1.25 });
      });
      break;
    }
    case 'zahl':
      head(b, 'folie-zahl', X, 200, 1000, size(520), t.grasText);
      b.text('folie-zahl-text', '', 1120, 330, 690, 56, { lineHeight: 1.2 });
      b.text('folie-quelle', '', X + 6, 900, 1500, 30);
      break;
    case 'zitat':
      b.text('folie-intro', '', X + 6, 100, 1700, 50, { type: 'subheader', fill: t.lime });
      flaeche('folie-kachel-zitat', 200, 600);
      head(b, 'folie-zitat', X + 50, 240, AREA_W - 100, size(100));
      b.text('folie-zitat-name', '', X + 6, 840, 1500, 44, { fill: t.lime });
      break;
    case 'danke':
      logoOben(b, ctx.locale, X, b.ink.logoAssetId);
      head(b, 'folie-headline', X, 280, 1700, size(230), t.grasText, 'Vielen Dank');
      b.text('folie-text', 'für eure Aufmerksamkeit!', X + 6, 660, 1500, 56, {
        type: 'subheader',
        family: b.ink.headline,
        fill: WHITE,
      });
      b.text('folie-kontakt', '', X + 6, 780, 1400, 28, { lineHeight: 1.3 });
      break;
  }
  return finishFolie(b, folie, ctx, 'kacheln');
}

export const KACHELN_BOXES: Record<FolienTypId, Record<string, DeckStilBox>> = {
  titel: {
    'folie-headline': { maxHeight: 480, minScale: 0.6 },
    'folie-text': { maxHeight: 280, minScale: 0.8 },
  },
  liste: { 'folie-headline': { maxHeight: 200, minScale: 0.6 } },
  text: {
    'folie-headline': { maxHeight: 180, minScale: 0.6 },
    'folie-spalte-1': { maxHeight: 560, minScale: 0.8 },
  },
  kernsatz: {
    'folie-headline': { maxHeight: 80, minScale: 0.6 },
    'folie-kernsatz': { maxHeight: 480, minScale: 0.6 },
  },
  zahl: {
    'folie-zahl': { maxHeight: 450, minScale: 0.6 },
    'folie-zahl-text': { maxHeight: 520, minScale: 0.7 },
  },
  zitat: { 'folie-zitat': { maxHeight: 520, minScale: 0.6 } },
  danke: { 'folie-headline': { maxHeight: 330, minScale: 0.6 } },
};
