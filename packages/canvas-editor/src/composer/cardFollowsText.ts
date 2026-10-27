import { runMeasurer } from '@ggraphic/editor/utils/textUtils';
import { layoutRichTextBlock } from '@ggraphic/schema';

import type { AdditionalText } from '../configs/types';
import type { ShapeInstance } from '@ggraphic/editor/utils/shapes';

interface CardPage {
  additionalTexts: AdditionalText[];
  shapeInstances: ShapeInstance[];
}

const textHeight = (t: AdditionalText) => {
  const measure = runMeasurer(t.fontSize, t.fontFamily, t.fontStyle ?? 'normal', 0, t.accent);
  return layoutRichTextBlock(t.text, t.width, measure).length * t.fontSize * (t.lineHeight ?? 1.2);
};

/**
 * The page with the composer's card behind `textId` (`${textId}-card`) grown or
 * shrunk by what `partial` (new text, width, size …) adds or removes in lines;
 * its top stays. The card keeps the sum in `textGrowth`, so the lift reads that
 * much as the composer's own size, not as a hand style that would pin it
 * through a recompose.
 */
export function withCardFollowingText<S extends CardPage>(
  state: S,
  textId: string,
  partial: Partial<AdditionalText>
): S {
  const text = state.additionalTexts.find((t) => t.id === textId);
  return text ? withCardResizedFor(state, text, { ...text, ...partial }) : state;
}

/** The same for a text already changed from `before` to `after` (a recompose's hand styles). */
export function withCardResizedFor<S extends CardPage>(
  state: S,
  before: AdditionalText,
  after: AdditionalText
): S {
  const card = state.shapeInstances.find((s) => s.id === `${before.id}-card`);
  if (!card || card.rotation) return state;
  const delta = textHeight(after) - textHeight(before);
  if (!delta) return state;
  const grown: ShapeInstance = {
    ...card,
    y: card.y + delta / 2,
    height: card.height + delta / card.scaleY,
    textGrowth: (card.textGrowth ?? 0) + delta,
  };
  return { ...state, shapeInstances: state.shapeInstances.map((s) => (s === card ? grown : s)) };
}
