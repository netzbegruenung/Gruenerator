// SPDX-License-Identifier: MPL-2.0
/**
 * Ausrichtung des Textes in seiner Box — nicht die Lage der Box auf der Seite,
 * die richtet `alignment.ts` aus (#4963).
 *
 * Ein freier Text (`additionalTexts`) trägt `align` selbst. Bei einem
 * Vorlagen-Text steht sie fest in der Config (`TextElementConfig.align`); was
 * die Nutzer*in wählt, steht deshalb in `templateTextAligns`, je Element-ID —
 * wie die Drehung in `templateRotations`, damit keine Vorlage einen eigenen
 * Schlüssel braucht.
 */

import { TEXT_ALIGNS, type TextAlign } from '@ggraphic/core';

export { TEXT_ALIGNS, type TextAlign } from '@ggraphic/core';

export function isTextAlign(value: unknown): value is TextAlign {
  return TEXT_ALIGNS.includes(value as TextAlign);
}

/** Die gewählte Ausrichtung eines Vorlagen-Textes; `null` ohne Eintrag. */
export function templateTextAlignOf(state: Record<string, unknown>, id: string): TextAlign | null {
  const record = state.templateTextAligns as Record<string, unknown> | null | undefined;
  const value = record && typeof record === 'object' ? record[id] : null;
  return isTextAlign(value) ? value : null;
}

/** `templateTextAligns` mit der Ausrichtung dieses Elements. */
export function withTemplateTextAlign(
  prev: Record<string, unknown>,
  id: string,
  align: TextAlign
): Record<string, TextAlign> {
  const current = prev.templateTextAligns;
  const record =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, TextAlign>)
      : {};
  return { ...record, [id]: align };
}
