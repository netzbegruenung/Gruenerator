import { stripInlineMarks } from '@gruenerator/contracts';

/** Text fallback from the rendered page state, never the generation-time spec.
 * This transcribes text; it does not describe photographs or other visuals.
 */
export function slideAltText(page: Record<string, unknown>, index: number, count: number): string {
  const texts: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const text = stripInlineMarks(value).replace(/\s+/g, ' ').trim();
    if (text) texts.push(text);
  };
  // Legacy slider templates store their fixed text fields directly on the page.
  if (page.slideVariant !== 'content' && page.labelOpacity !== 0) add(page.label);
  if (page.headlineOpacity !== 0) add(page.headline);
  if (page.subtextOpacity !== 0) add(page.subtext);
  if (page.slideVariant === 'content' && page.subtext2Opacity !== 0) add(page.subtext2);
  // Creator/freeform slides (including editor edits) keep text in additionalTexts.
  if (Array.isArray(page.additionalTexts)) {
    const items: unknown[] = page.additionalTexts;
    for (const item of items) {
      if (
        item &&
        typeof item === 'object' &&
        'text' in item &&
        (!('opacity' in item) || item.opacity !== 0)
      ) {
        add(item.text);
      }
    }
  }
  const position = `Karussell-Folie ${index + 1} von ${count}`;
  return texts.length ? `${position}: ${texts.join(' ')}` : position;
}
