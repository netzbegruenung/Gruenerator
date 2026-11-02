/**
 * The composer's text cards follow their text. Moved here from
 * `@ggraphic/editor` (composer/cardFollowsText) in D2e: the `${textId}-card`
 * id is our composer's convention, and the editor keeps only the neutral part,
 * reading `textGrowth` from the core model when it lifts a page.
 */
import { type AdditionalText } from '@ggraphic/editor/config';
import { type ShapeInstance } from '@ggraphic/editor/elements';
import { runMeasurer } from '@ggraphic/editor/text';
import { layoutRichTextBlock } from '@ggraphic/schema';

interface CardPage {
  additionalTexts: AdditionalText[];
  shapeInstances: ShapeInstance[];
}

const textHeight = (t: AdditionalText) => {
  const measure = runMeasurer(
    t.fontSize,
    t.fontFamily,
    t.fontStyle ?? 'normal',
    0,
    t.accent,
    t.fontWeight ?? null,
    t.letterSpacing ?? null
  );
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
