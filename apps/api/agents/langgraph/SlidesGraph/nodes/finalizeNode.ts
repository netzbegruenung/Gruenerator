/**
 * Finalize Node
 *
 * Assembles the final presentation by normalizing all slide content
 * and producing the output GeneratedSlide array.
 *
 * Part of the SlidesGraph pipeline:
 *   START → outline → content → validate → [correct|finalize] → END
 */

import { normalizeAIContent } from '../types.js';

import type { SlidesGraphState, GeneratedSlide } from '../types.js';

/**
 * Normalizes all slide content as a final safety net and produces
 * the finalSlides array. If validation errors remain after max retries,
 * the slides are still included (best effort).
 */
export async function finalizeNode(state: SlidesGraphState): Promise<Partial<SlidesGraphState>> {
  const startTime = Date.now();
  const { slides, validationErrors } = state;

  console.log('[slides-graph] finalizeNode starting', {
    slideCount: slides.length,
    remainingErrors: validationErrors.length,
  });

  const finalSlides: GeneratedSlide[] = slides.map((slide) => {
    const normalized = normalizeAIContent(slide.content) as Record<string, unknown>;

    return {
      index: slide.index,
      layoutGroup: slide.layoutGroup,
      layout: slide.layout,
      suggestedLayout: slide.suggestedLayout,
      content: normalized,
      speakerNote: slide.speakerNote,
    };
  });

  const finalizeTimeMs = Date.now() - startTime;
  const errCount = validationErrors.length;

  if (errCount > 0) {
    console.log(
      `[slides-graph] Finalized ${finalSlides.length} slides (${errCount} with remaining validation issues)`
    );
  } else {
    console.log(
      `[slides-graph] Finalized ${finalSlides.length} slides (${errCount} with remaining validation issues)`
    );
  }

  return {
    finalSlides,
    finalizeTimeMs,
  };
}
