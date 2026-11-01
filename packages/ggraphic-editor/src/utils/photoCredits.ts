// SPDX-License-Identifier: MPL-2.0
import { type StockImageAttribution } from '@ggraphic/editor/common/imageSourceTypes';

import type { UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

/** Alle Foto-Nachweise einer Seite: Hintergrundfoto und eingefügte Fotos. */
export function pagePhotoCredits(state: Record<string, unknown>): StockImageAttribution[] {
  const background = state.imageAttribution as StockImageAttribution | null | undefined;
  const images = (state.userImageInstances as UserImageInstance[] | undefined) ?? [];
  return [background, ...images.map((image) => image.attribution)].filter(
    (credit): credit is StockImageAttribution => Boolean(credit)
  );
}
