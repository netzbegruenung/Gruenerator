/**
 * Correct Node
 *
 * Fixes slides that failed schema validation by regenerating their content
 * using the actual layout JSON schema as the response format.
 * The AI is given the validation errors and the expected schema structure.
 */

import { getLayoutSchema } from '@gruenerator/slides/schemas';
import { generateObject, jsonSchema } from 'ai';
import * as z from 'zod/v4';

import {
  getSlideModel,
  SlideContentSchema,
  LAYOUT_FIELD_SPECS,
  normalizeAIContent,
} from '../types.js';

import type { SlidesGraphState, GeneratedSlide } from '../types.js';

/**
 * Removes fields from a JSON schema's properties (recursively).
 */
function removeFieldsFromJsonSchema(
  schema: Record<string, unknown>,
  fieldsToRemove: string[]
): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;

  function recurse(obj: Record<string, unknown>) {
    const properties = obj.properties as Record<string, unknown> | undefined;
    if (properties && typeof properties === 'object') {
      for (const field of fieldsToRemove) {
        delete properties[field];
      }
      const required = obj.required;
      if (Array.isArray(required)) {
        obj.required = required.filter((r: string) => !fieldsToRemove.includes(r));
      }
      for (const prop of Object.values(properties)) {
        if (prop && typeof prop === 'object') recurse(prop as Record<string, unknown>);
      }
    }
    const items = obj.items as Record<string, unknown> | undefined;
    if (items && typeof items === 'object') recurse(items);
  }

  recurse(result);
  return result;
}

export async function correctNode(state: SlidesGraphState): Promise<Partial<SlidesGraphState>> {
  const startTime = Date.now();
  const { slides, validationErrors } = state;

  console.log('[slides-graph] correctNode starting', {
    errorCount: validationErrors.length,
    retryCount: state.retryCount,
  });

  const updatedSlides: GeneratedSlide[] = [...slides];
  const model = getSlideModel();

  for (const validationError of validationErrors) {
    const slide = slides.find((s) => s.index === validationError.slideIndex);
    if (!slide) continue;

    console.log(
      `[slides-graph] Correcting slide ${slide.index}: ${validationError.errors.length} errors`
    );

    // Try to get the actual layout schema for strict correction
    const layoutZodSchema = getLayoutSchema(slide.layout);
    let responseJsonSchema: Record<string, unknown> | null = null;

    if (layoutZodSchema) {
      try {
        const rawJsonSchema = z.toJSONSchema(layoutZodSchema) as Record<string, unknown>;
        responseJsonSchema = removeFieldsFromJsonSchema(rawJsonSchema, [
          '__image_url__',
          '__icon_url__',
        ]);
      } catch {
        // Fall through to loose schema
      }
    }

    const systemPrompt = `Du bist ein Experte für die Korrektur von Präsentationsfolien-Daten.
Die vorherigen Daten haben die Schema-Validierung nicht bestanden.

Validierungsfehler:
${validationError.errors.join('\n')}

WICHTIGE REGELN:
- Beachte die Mindest- und Maximallängen strikt.
- Überschreite niemals die maximale Zeichenlänge.
- Für Bilder: Gib nur __image_prompt__ an.
- Für Icons: Gib nur __icon_query__ an.
- Keine Emojis.
- Kennzahlen kurz und prägnant.`;

    const userPrompt = `Korrigiere folgenden Inhalt:\n${JSON.stringify(slide.content, null, 2)}`;

    try {
      let content: Record<string, unknown>;
      let speakerNote: string | null = slide.speakerNote;

      if (responseJsonSchema) {
        // Use strict layout JSON schema
        const result = await generateObject({
          model,
          schema: jsonSchema(responseJsonSchema),
          system: systemPrompt,
          prompt: userPrompt,
          temperature: 0.3,
        });
        content = normalizeAIContent(result.object) as Record<string, unknown>;
      } else {
        // Fallback to loose schema
        const result = await generateObject({
          model,
          schema: SlideContentSchema,
          system: systemPrompt,
          prompt: userPrompt,
          temperature: 0.3,
        });
        content = normalizeAIContent(result.object.content) as Record<string, unknown>;
        speakerNote = result.object.speakerNote;
      }

      const arrayIndex = updatedSlides.findIndex((s) => s.index === slide.index);
      if (arrayIndex !== -1) {
        updatedSlides[arrayIndex] = { ...slide, content, speakerNote };
      }

      console.log(`[slides-graph] Slide ${slide.index} corrected successfully`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[slides-graph] Failed to correct slide ${slide.index}:`, message);
    }
  }

  const correctTimeMs = Date.now() - startTime;

  console.log('[slides-graph] correctNode completed', {
    correctedCount: validationErrors.length,
    retryCount: state.retryCount + 1,
    correctTimeMs,
  });

  return {
    slides: updatedSlides,
    retryCount: state.retryCount + 1,
    correctTimeMs,
  };
}
