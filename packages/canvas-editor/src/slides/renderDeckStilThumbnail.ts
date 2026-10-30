/**
 * Vorschau einer Deck-Vorlage: ein Beispiel-Folientyp im Stil, gebaut mit
 * `buildFolie` und vom echten Canvas gerendert (wie die Folienlayouts).
 */
import { buildFolie, type DeckStilId, type FolieSpec } from '@gruenerator/contracts/slides';

import { renderSlideState } from './renderSlideLayoutThumbnail';

import type { BrandLocale } from '../brand/theme';
import type { CanvasImageUrlService } from '@ggraphic/editor/hostServices';

export type DeckPreviewTyp = 'titel' | 'liste' | 'kernsatz';

const SAMPLES: Record<DeckPreviewTyp, FolieSpec> = {
  titel: { typ: 'titel', slots: { headline: 'Unser Plan', unterzeile: 'Für ein gutes Morgen' } },
  liste: {
    typ: 'liste',
    slots: { headline: 'Drei Schritte', punkte: ['Zuhören', 'Planen', 'Anpacken'] },
  },
  kernsatz: { typ: 'kernsatz', slots: { satz: 'Gemeinsam schaffen wir das' } },
};

export function renderDeckStilThumbnail(
  stil: DeckStilId,
  typ: DeckPreviewTyp,
  locale: BrandLocale,
  widthPx: number,
  imageUrls: CanvasImageUrlService
): Promise<string | null> {
  const state = buildFolie(stil, SAMPLES[typ], {
    locale,
    date: new Date(),
    pageNumber: 1,
    title: 'Vorschau',
    index: 0,
  }) as unknown as Record<string, unknown>;
  return renderSlideState(state, locale, widthPx, imageUrls);
}
