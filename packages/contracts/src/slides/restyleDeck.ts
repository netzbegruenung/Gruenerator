/**
 * Den Stil eines fertigen Decks wechseln: jede erkannte Folie wird gelesen
 * (`readFolie`, mit den Texten, wie sie jetzt dort stehen) und im neuen Stil
 * neu gebaut. Seiten-Ids bleiben, ebenso alles, was die Person selbst auf die
 * Folie gelegt hat (Elemente ohne `folie-`-Id, Bilder).
 */

import { type BrandLocale } from '../brand/grueneBrand.js';

import { buildFolie, deckStilBoxes, type DeckStilId } from './deckStile/index.js';
import { fitSlideTexts, type MeasureText } from './fitText.js';
import { type FolieSpec } from './folienTypen.js';
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
    return folie ? restylePage(page, index, stil, folie, ctx) : page;
  });
}

/** Eine Seite aus einer (gelesenen, ggf. geänderten) Folie im Stil neu bauen; Nutzer-Elemente, Sperren, Datum und Notizen bleiben. */
export function restylePage(
  page: DeckPage,
  index: number,
  stil: DeckStilId,
  folie: FolieSpec,
  ctx: RestyleContext
): DeckPage {
  {
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

    // Das Datum der Fußzeile bleibt, wie es im Deck steht.
    const oldDate = (
      page.state['additionalTexts'] as { id?: unknown; text?: unknown }[] | undefined
    )?.find((t) => t?.id === 'folie-datum')?.text;
    if (typeof oldDate === 'string' && Array.isArray(next['additionalTexts'])) {
      next['additionalTexts'] = (next['additionalTexts'] as { id?: unknown }[]).map((t) =>
        t.id === 'folie-datum' ? { ...t, text: oldDate } : t
      );
    }

    // Gesperrt bleibt gesperrt: die Sperren der übernommenen Elemente mitnehmen.
    const kept = new Set(layerOrder);
    const locked = Array.isArray(next['lockedLayerIds'])
      ? (next['lockedLayerIds'] as string[])
      : [];
    const carried = (
      Array.isArray(page.state['lockedLayerIds']) ? (page.state['lockedLayerIds'] as string[]) : []
    ).filter((id) => !id.startsWith(FOLIE_PREFIX) && kept.has(id) && !locked.includes(id));
    next['lockedLayerIds'] = [...locked, ...carried];
    return { ...page, state: next };
  }
}
