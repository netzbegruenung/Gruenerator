import { type StockImageAttribution } from '../common/imageSourceTypes';

import type { UserImageInstance } from './userImageUtils';

/** Alle Foto-Nachweise einer Seite: Hintergrundfoto und eingefügte Fotos. */
export function pagePhotoCredits(state: Record<string, unknown>): StockImageAttribution[] {
  const background = state.imageAttribution as StockImageAttribution | null | undefined;
  const images = (state.userImageInstances as UserImageInstance[] | undefined) ?? [];
  return [background, ...images.map((image) => image.attribution)].filter(
    (credit): credit is StockImageAttribution => Boolean(credit)
  );
}
