// SPDX-License-Identifier: MPL-2.0
import { STROKE_ONLY_SHAPES } from '@ggraphic/editor/utils/shapes';

import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';

export interface EffectsAvailability {
  gradient: boolean;
  outline: boolean;
  shadow: boolean;
}

/**
 * Welche Effekte die Auswahl kennt — für den Knopf „Effekte“ in der Leiste und
 * den Bereich, den er öffnet; beide fragen hier.
 *
 * Nur freie Texte (`additionalTexts`) speichern Effekt-Felder; Vorlagen-Texte
 * laufen über State-Keys. Linien und Pfeile haben keine Fläche, ein Verlauf
 * dort wäre wirkungslos. Bilder haben ihren Schatten im Bereich „Bearbeiten“.
 */
export function effectsFor(module: FloatingModuleState | null): EffectsAvailability {
  const type = module?.type;
  const isEffectText = type === 'text' && !!module?.data.isInstanceText;
  const isFillableShape = type === 'shape' && !STROKE_ONLY_SHAPES.has(String(module?.data.type));
  return {
    gradient: isFillableShape || isEffectText,
    outline: isEffectText,
    shadow: type === 'shape' || isEffectText,
  };
}

export function hasEffects(module: FloatingModuleState | null): boolean {
  const { gradient, outline, shadow } = effectsFor(module);
  return gradient || outline || shadow;
}
