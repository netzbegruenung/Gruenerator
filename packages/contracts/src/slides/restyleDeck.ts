/**
 * Den Stil eines fertigen Decks wechseln: jede erkannte Folie wird gelesen
 * (`readFolie`, mit den Texten, wie sie jetzt dort stehen) und im neuen Stil
 * neu gebaut. Seiten-Ids bleiben, ebenso alles, was die Person selbst auf die
 * Folie gelegt hat (Elemente ohne `folie-`-Id, Bilder).
 */

import { type BrandLocale } from '../brand/grueneBrand.js';

import { buildFolie, deckStilBoxes, type DeckStilId } from './deckStile/index.js';
import { fitSlideTexts, type MeasureText } from './fitText.js';
import { readFolie } from './slideDeck.js';
import { type DeckPage, ELEMENT_COLLECTIONS } from './slideDeckEdit.js';

export interface RestyleContext {
  locale: BrandLocale;
  date: Date;
  /** Titel des Decks, in der Fußzeile. */
  title: string;
  measure?: MeasureText | null;
}

const FOLIE_PREFIX = 'folie-';

type Item = { id?: unknown };

function userItems(state: Record<string, unknown>, key: string): Item[] {
  const raw = state[key];
  if (!Array.isArray(raw)) return [];
  return (raw as Item[]).filter(
    (e) => !(typeof e?.id === 'string' && e.id.startsWith(FOLIE_PREFIX))
  );
}

export function restyleDeck(pages: DeckPage[], stil: DeckStilId, ctx: RestyleContext): DeckPage[] {
  return pages.map((page, index) => {
    const folie = readFolie(page.state);
    if (!folie) return page;

    let next: Record<string, unknown> = buildFolie(stil, folie, {
      locale: ctx.locale,
      date: ctx.date,
      pageNumber: index + 1,
      title: ctx.title,
      index,
    }) as unknown as Record<string, unknown>;
    if (ctx.measure) {
      next = fitSlideTexts(next as never, deckStilBoxes(stil, folie.typ), ctx.measure)
        .state as unknown as Record<string, unknown>;
    }

    const layerOrder = Array.isArray(next['layerOrder'])
      ? [...(next['layerOrder'] as string[])]
      : [];
    for (const key of ELEMENT_COLLECTIONS) {
      const mine = userItems(page.state, key);
      if (mine.length === 0) continue;
      const existing = Array.isArray(next[key]) ? (next[key] as Item[]) : [];
      next[key] = [...existing, ...mine];
      for (const e of mine) {
        if (typeof e.id === 'string' && !layerOrder.includes(e.id)) layerOrder.push(e.id);
      }
    }
    next['layerOrder'] = layerOrder;
    return { ...page, state: next };
  });
}
