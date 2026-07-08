import { formatSlidesAsMarkdown, type Slide } from '@gruenerator/contracts';

/**
 * Serialize the deck to the numbered markdown outline the AI edits against.
 * Delegates to the shared contracts formatter so the frontend and backend
 * produce byte-identical context (and therefore identical slide numbering).
 */
export function serializePresentationContext(slides: readonly Slide[], title: string): string {
  return formatSlidesAsMarkdown(slides, title);
}
