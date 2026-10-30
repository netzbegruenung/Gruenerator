/**
 * Stil `band` (Entwurf B): Sand (AT Weiß) mit Tannenband links (640 breit).
 * Das Band trägt Thema, Zahl und Störer, rechts steht der Inhalt. Text- und
 * Danke-Folie zeigt der Entwurf nicht: Text nimmt Band + Überschrift der
 * Liste und rechts den Fließtext, Danke das Logo im Band und die Schlusszeile
 * rechts wie auf der Titelfolie.
 */

import { type FolieSpec, type FolienTypId } from '../folienTypen.js';
import { SlideBuilder, slideKit, type SlideLayoutState } from '../slideLayouts.js';

import {
  finishFolie,
  fs,
  head,
  listItems,
  logoOben,
  renderList,
  rgba,
  stilInk,
  stoerer,
  stoererOf,
  STOERER_MAGENTA,
  textOf,
  tonesOf,
  type DeckStilCtx,
} from './shared.js';

import { type DeckStilBox } from './index.js';

const BAND = 640;
const RX = 740;
const WHITE = '#FFFFFF';
/** Texte, die je Folientyp auf dem Tannenband stehen; alles andere liegt auf Sand. */
const BAND_RESIDENT: Record<FolienTypId, string[]> = {
  titel: [],
  liste: ['folie-headline'],
  text: ['folie-headline'],
  kernsatz: ['folie-headline'],
  zahl: ['folie-zahl', 'folie-quelle'],
  zitat: ['folie-intro'],
  danke: ['folie-kontakt'],
};

export function buildBand(folie: FolieSpec, ctx: DeckStilCtx): SlideLayoutState {
  const t = tonesOf(ctx.locale);
  const b = new SlideBuilder(stilInk(ctx.locale, true, t.sand), null);
  const size = (n: number) => fs(ctx.locale, n);
  const störer = stoererOf(folie);
  b.shape('folie-band', 'rect', BAND / 2, 540, BAND, 1080, t.tanne);
  b.lock('folie-band');
  // Entwurf: Thema im Band bei (110, 180), 120 px, 440 breit.
  const kopfImBand = (id: string) => head(b, id, 110, 180, 440, size(120), WHITE);
  switch (folie.typ) {
    case 'titel':
      head(b, 'folie-headline', RX, 300, 1080, size(200));
      b.text('folie-text', '', RX + 6, 740, 1000, 44);
      if (störer) stoerer(b, störer, 320, 800, STOERER_MAGENTA);
      break;
    case 'liste': {
      kopfImBand('folie-headline');
      const items = listItems(folie, 'punkte');
      items.forEach((_, i) => {
        const y = 150 + i * 123;
        b.text(`folie-nummer-${i + 1}`, String(i + 1), RX, y + 10, 100, size(80), {
          type: 'header',
          family: b.ink.headline,
          fill: b.ink.accent?.fill ?? t.tanne,
          lineHeight: 1,
        });
        b.shape(`folie-linie-${i + 1}`, 'rect', 1275, y + 120, 1070, 3, rgba(t.tanne, 0.2));
      });
      renderList(b, items, { x: 850, y: 160, width: 960, size: 52, pitch: 123, prefix: '' });
      if (störer) stoerer(b, störer, 320, 860, STOERER_MAGENTA);
      break;
    }
    case 'text':
      kopfImBand('folie-headline');
      b.text('folie-spalte-1', '', RX, 150, 1070, 44, { lineHeight: 1.4 });
      break;
    case 'kernsatz':
      b.text('folie-headline', '', 110, 110, 440, 56, {
        type: 'header',
        family: b.ink.headline,
        fill: t.lime,
        lineHeight: 1,
      });
      head(b, 'folie-kernsatz', RX, 200, 1060, size(120));
      renderList(b, listItems(folie, 'punkte'), {
        x: RX + 6,
        y: 800,
        width: 1070,
        size: 38,
        pitch: 56,
      });
      break;
    case 'zahl':
      // Entwurf: Zahl 250 bei (90, 360) und weiße Erklärung bei (116, 700) im Band, der große Satz rechts.
      // Unsere Slots: `quelle` ist die kurze Zeile und steht deshalb im Band an der Stelle der Erklärung,
      // `zahl-text` ist der Satz und steht rechts in der Größe des Entwurfs.
      // 520 statt Entwurfsbreite: das Band ist 640 breit, links und rechts bleibt Rand.
      head(b, 'folie-zahl', 90, 360, 520, size(250), t.lime);
      b.text('folie-quelle', '', 116, 700, 440, 40, { fill: WHITE });
      head(b, 'folie-zahl-text', RX, 300, 1060, size(120));
      break;
    case 'zitat':
      b.text('folie-intro', '', 110, 110, 440, 34, { type: 'subheader', fill: t.lime });
      head(b, 'folie-zitat', RX, 300, 1060, size(120));
      b.text('folie-zitat-name', '', RX + 6, 930, 1060, 40, {
        fill: b.ink.accent?.fill ?? t.tanne,
      });
      break;
    case 'danke':
      logoOben(b, ctx.locale, 90, slideKit.inkFor(ctx.locale, 'dunkel').logoAssetId);
      head(b, 'folie-headline', RX, 300, 1080, size(200), undefined, 'Vielen Dank');
      b.text('folie-text', 'für eure Aufmerksamkeit!', RX + 6, 740, 1000, 54, {
        type: 'subheader',
        family: b.ink.headline,
      });
      b.text('folie-kontakt', '', 110, 480, 440, 28, { fill: WHITE, lineHeight: 1.3 });
      break;
  }
  const state = finishFolie(b, folie, ctx, 'band');
  // Das Datum steht im Band und wird dort weiß.
  // Im Band hebt `==…==` hell hervor: Klee auf Tanne hielte 1,8:1, in AT wäre der Akzent der Grund selbst.
  for (const id of BAND_RESIDENT[folie.typ]) {
    const el = b.state.additionalTexts.find((x) => x.id === id);
    if (el) el.accent = { fill: t.lime };
  }
  const datum = textOf(b, 'folie-datum');
  datum.fill = WHITE;
  datum.width = 500;
  return state;
}

export const BAND_BOXES: Record<FolienTypId, Record<string, DeckStilBox>> = {
  titel: {
    'folie-headline': { maxHeight: 420, minScale: 0.6 },
    'folie-text': { maxHeight: 250, minScale: 0.8 },
  },
  liste: { 'folie-headline': { maxHeight: 530, minScale: 0.6 } },
  text: {
    'folie-headline': { maxHeight: 750, minScale: 0.6 },
    'folie-spalte-1': { maxHeight: 780, minScale: 0.8 },
  },
  kernsatz: {
    'folie-headline': { maxHeight: 500, minScale: 0.6 },
    'folie-kernsatz': { maxHeight: 560, minScale: 0.6 },
  },
  zahl: {
    'folie-zahl': { maxHeight: 340, minScale: 0.6 },
    'folie-zahl-text': { maxHeight: 560, minScale: 0.7 },
  },
  zitat: { 'folie-zitat': { maxHeight: 600, minScale: 0.6 } },
  danke: { 'folie-headline': { maxHeight: 400, minScale: 0.6 } },
};
