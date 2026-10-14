import { layoutRichTextBlock } from '@gruenerator/contracts';

import { runMeasurer } from '../utils/textUtils';

import type { AdditionalText } from '../configs/types';
import type { ShapeInstance } from '../utils/shapes';

interface CardPage {
  additionalTexts: AdditionalText[];
  shapeInstances: ShapeInstance[];
}

const textHeight = (t: AdditionalText, value: string) => {
  const measure = runMeasurer(t.fontSize, t.fontFamily, t.fontStyle ?? 'normal', 0, t.accent);
  return layoutRichTextBlock(value, t.width, measure).length * t.fontSize * (t.lineHeight ?? 1.2);
};

/**
 * The page with the composer's card behind `textId` (`${textId}-card`) grown or
 * shrunk by what `nextText` adds or removes in lines; its top stays. The card
 * keeps the sum in `textGrowth`, so the lift reads that much as the composer's
 * own size, not as a hand style that would pin it through a recompose.
 */
export function withCardFollowingText<S extends CardPage>(
  state: S,
  textId: string,
  nextText: string
): S {
  const text = state.additionalTexts.find((t) => t.id === textId);
  const card = state.shapeInstances.find((s) => s.id === `${textId}-card`);
  if (!text || !card || card.rotation) return state;
  const delta = textHeight(text, nextText) - textHeight(text, text.text);
  if (!delta) return state;
  const grown: ShapeInstance = {
    ...card,
    y: card.y + delta / 2,
    height: card.height + delta / card.scaleY,
    textGrowth: (card.textGrowth ?? 0) + delta,
  };
  return { ...state, shapeInstances: state.shapeInstances.map((s) => (s === card ? grown : s)) };
}
