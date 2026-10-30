/**
 * Vorschau einer Deck-Vorlage: ein Beispiel-Folientyp im Stil, gebaut mit
 * `buildFolie` und vom echten Canvas gerendert (wie die Folienlayouts).
 */
import { buildFolie, type DeckStilId, type FolienTypId } from '@gruenerator/contracts/slides';

import { DECK_FOLIE_SAMPLES } from './deckFolieSamples';
import { renderSlideState } from './renderSlideLayoutThumbnail';

import type { BrandLocale } from '../brand/theme';
import type { CanvasImageUrlService } from '@ggraphic/editor/hostServices';

export type DeckPreviewTyp = FolienTypId;

export function renderDeckStilThumbnail(
  stil: DeckStilId,
  typ: DeckPreviewTyp,
  locale: BrandLocale,
  widthPx: number,
  imageUrls: CanvasImageUrlService
): Promise<string | null> {
  const state = buildFolie(stil, DECK_FOLIE_SAMPLES[typ], {
    locale,
    date: new Date(),
    pageNumber: 1,
    title: 'Titel der Präsentation',
    index: 0,
  }) as unknown as Record<string, unknown>;
  return renderSlideState(state, locale, widthPx, imageUrls);
}
