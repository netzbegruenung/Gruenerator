import { type CanvasDocument } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';

/**
 * Neue Präsentation als Canvas: Format `slide-16-9`, eine Titelfolie aus den
 * CD-Layouts. Österreich nimmt die AT-Vorlage, damit das Corporate Design stimmt.
 */
export async function createSlideDeck(locale: string | null): Promise<CanvasDocument> {
  const { buildSlideLayout, DEFAULT_SLIDE_LAYOUT, slideLayoutConfigId } =
    await import('@gruenerator/canvas-editor/slides');
  const brandLocale = locale === 'de-AT' ? 'de-AT' : 'de-DE';
  const templateType = slideLayoutConfigId(brandLocale);
  const state = buildSlideLayout(DEFAULT_SLIDE_LAYOUT, {
    locale: brandLocale,
    pageNumber: 1,
    date: new Date(),
  });
  const response = await getContractsClient().canvas.create({
    body: {
      title: 'Neue Präsentation',
      template_type: templateType,
      format: 'slide-16-9',
      initial_state: { ...state, pages: [{ id: 'seed-0', configId: templateType, state }] },
      page_count: 1,
    },
  });
  if (response.status !== 201) {
    throw new ApiError(
      response.status,
      `Präsentation konnte nicht erstellt werden (HTTP ${response.status}).`
    );
  }
  return response.body;
}
