import { type CanvasDocument } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';

/**
 * Leere Präsentation als Canvas: Format `slide-16-9`, eine leere freie Seite.
 * Österreich nimmt die AT-Vorlage, damit das Corporate Design stimmt.
 */
export async function createSlideDeck(locale: string | null): Promise<CanvasDocument> {
  const response = await getContractsClient().canvas.create({
    body: {
      title: 'Neue Präsentation',
      template_type: locale === 'de-AT' ? 'freeform-at' : 'freeform',
      format: 'slide-16-9',
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
