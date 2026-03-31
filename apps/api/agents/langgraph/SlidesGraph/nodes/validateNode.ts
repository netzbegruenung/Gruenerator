/**
 * Validate Node
 *
 * Validates each slide's content against its layout's Zod schema.
 * This is a pure CPU operation — no AI calls.
 *
 * Part of the SlidesGraph pipeline:
 *   START → outline → content → validate → [correct|finalize] → END
 */

import { getLayoutSchema } from '@gruenerator/slides/schemas';

import type { SlidesGraphState, SlideValidationError } from '../types.js';

/**
 * Validates each slide's content against the Zod schema for its layout.
 * Records validation errors for slides that fail, which the correct node
 * can then attempt to fix.
 */
export async function validateNode(state: SlidesGraphState): Promise<Partial<SlidesGraphState>> {
  const startTime = Date.now();
  const { slides } = state;

  console.log('[slides-graph] validateNode starting', {
    slideCount: slides.length,
  });

  const validationErrors: SlideValidationError[] = [];
  let passedCount = 0;

  for (const slide of slides) {
    const schema = getLayoutSchema(slide.layout);

    if (!schema) {
      console.log(
        `[slides-graph] No schema found for layout "${slide.layout}" (slide ${slide.index}), skipping validation`
      );
      passedCount++;
      continue;
    }

    const result = schema.safeParse(slide.content);

    if (result.success) {
      passedCount++;
    } else {
      const issues = result.error?.issues ?? [];
      const errors = issues.map((i: { message: string }) => i.message);

      console.log(
        `[slides-graph] Slide ${slide.index} ("${slide.suggestedLayout}") failed validation:`,
        errors
      );

      validationErrors.push({
        slideIndex: slide.index,
        errors,
      });
    }
  }

  const validateTimeMs = Date.now() - startTime;
  const failedCount = validationErrors.length;

  console.log(
    `[slides-graph] Validation: ${passedCount}/${slides.length} slides passed, ${failedCount} failed`,
    { validateTimeMs }
  );

  return {
    validationErrors,
    validateTimeMs,
  };
}
