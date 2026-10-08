import {
  layoutRichTextBlock,
  SHAREPIC_SOURCE_KEY,
  type SharepicSource,
} from '@gruenerator/contracts';

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
 * shrunk by what `nextText` adds or removes in lines; its top stays. The
 * source baseline moves along: the card follows the text, it is no hand style,
 * so the next lift must not pin it through a recompose.
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

  const grow = <T extends { y?: number; height?: number }>(el: T): T =>
    el.y === undefined || el.height === undefined
      ? el
      : { ...el, y: el.y + delta / 2, height: el.height + delta / card.scaleY };
  // Boundary cast: the source rides along in the page state under its own key.
  const source = (state as Record<string, unknown>)[SHAREPIC_SOURCE_KEY] as
    SharepicSource | undefined;
  const base = source?.baseline.elements[card.id];
  return {
    ...state,
    shapeInstances: state.shapeInstances.map((s) => (s === card ? grow(s) : s)),
    ...(source &&
      base && {
        [SHAREPIC_SOURCE_KEY]: {
          ...source,
          baseline: {
            ...source.baseline,
            elements: { ...source.baseline.elements, [card.id]: grow(base) },
          },
        },
      }),
  };
}
