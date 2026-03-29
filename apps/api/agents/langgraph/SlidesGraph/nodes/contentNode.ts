/**
 * Content Node
 *
 * Generates detailed structured content for each slide in the outline.
 * Uses the actual layout Zod schema (converted to JSON schema) as the
 * response format — the AI is forced to output data matching the layout.
 * Follows the same approach as the original Presenton tool.
 */

import { getLayoutSchema } from '@gruenerator/slides/schemas';
import { generateObject, jsonSchema } from 'ai';
import * as z from 'zod/v4';

import {
  SlideContentSchema,
  LAYOUT_MAP,
  LAYOUT_FIELD_SPECS,
  TONE_DESCRIPTIONS,
  VERBOSITY_HINTS,
  getSlideModel,
  normalizeAIContent,
} from '../types.js';

import type { SlidesGraphState, GeneratedSlide } from '../types.js';

/**
 * Removes fields from a JSON schema's properties (recursively).
 * Mirrors Presenton's `remove_fields_from_schema()`.
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

/**
 * Adds the __speaker_note__ field to a JSON schema.
 */
function addSpeakerNoteToSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  const properties = (result.properties || {}) as Record<string, unknown>;
  properties.__speaker_note__ = {
    type: 'string',
    minLength: 50,
    maxLength: 300,
    description: 'Speaker note for the slide — simple text, no markdown',
  };
  result.properties = properties;
  const required = (result.required || []) as string[];
  if (!required.includes('__speaker_note__')) {
    required.push('__speaker_note__');
  }
  result.required = required;
  return result;
}

/**
 * Builds a cross-slide context block so the AI avoids repeating content.
 */
function buildCrossSlideContext(
  completedSlides: Array<{ title: string; description: string }>,
  currentIndex: number,
  totalSlides: number
): string {
  if (completedSlides.length === 0) return '';

  const previousList = completedSlides
    .map((s, i) => `${i + 1}. "${s.title}" — ${s.description}`)
    .join('\n');

  return `\nBisherige Folien:\n${previousList}\nGeneriere jetzt Folie ${currentIndex + 1} von ${totalSlides}. Vermeide inhaltliche Wiederholungen!`;
}

export async function contentNode(state: SlidesGraphState): Promise<Partial<SlidesGraphState>> {
  const startTime = Date.now();
  const { outline, options } = state;

  if (!outline) {
    console.error('[slides-graph] contentNode called without outline');
    return {
      error: 'Content generation failed: no outline available',
      contentTimeMs: Date.now() - startTime,
    };
  }

  console.log('[slides-graph] contentNode starting', {
    slideCount: outline.slides.length,
    presentationTitle: outline.title,
  });

  const model = getSlideModel();
  const toneHint = TONE_DESCRIPTIONS[options.tone] || '';
  const verbosityHint = VERBOSITY_HINTS[options.verbosity] || '';

  const slides: GeneratedSlide[] = [];
  const completedSlides: Array<{ title: string; description: string }> = [];

  for (let i = 0; i < outline.slides.length; i++) {
    const slideOutline = outline.slides[i]!;

    const layoutInfo = LAYOUT_MAP[slideOutline.suggestedLayout] || LAYOUT_MAP['basic-info']!;
    const fellBack = !LAYOUT_MAP[slideOutline.suggestedLayout];
    const layoutFields =
      LAYOUT_FIELD_SPECS[slideOutline.suggestedLayout] || LAYOUT_FIELD_SPECS['basic-info']!;

    console.log(`[slides-graph] contentNode generating slide ${i + 1}/${outline.slides.length}`, {
      title: slideOutline.title,
      suggestedLayout: slideOutline.suggestedLayout,
      resolvedLayout: layoutInfo.layout,
      fellBackToBasicInfo: fellBack,
    });

    // Try to get the actual layout Zod schema and convert to JSON schema
    const layoutZodSchema = getLayoutSchema(layoutInfo.layout);
    let useStrictSchema = false;
    let responseJsonSchema: Record<string, unknown> | null = null;

    if (layoutZodSchema) {
      try {
        const rawJsonSchema = z.toJSONSchema(layoutZodSchema) as Record<string, unknown>;
        // Remove __image_url__ and __icon_url__ (resolved later, not by AI)
        const stripped = removeFieldsFromJsonSchema(rawJsonSchema, [
          '__image_url__',
          '__icon_url__',
        ]);
        responseJsonSchema = addSpeakerNoteToSchema(stripped);
        useStrictSchema = true;
        console.log(`[slides-graph] contentNode using strict layout schema for slide ${i + 1}`, {
          schemaKeys: Object.keys((responseJsonSchema.properties || {}) as object),
        });
      } catch (err) {
        console.warn(
          `[slides-graph] contentNode failed to convert layout schema for slide ${i + 1}, falling back to loose schema:`,
          err
        );
      }
    }

    const systemPrompt = `Du bist ein Experte für Präsentationsfolien-Inhalte. Generiere strukturierte Inhalte für eine einzelne Folie.
${toneHint}
${verbosityHint}
Sprache: ${options.language}

WICHTIGE REGELN:
- Beachte die Mindest- und Maximallängen der Felder strikt.
- Überschreite niemals die maximale Zeichenlänge — kürze lieber den Text.
- Für Bilder: Gib nur __image_prompt__ an (Beschreibung des gewünschten Bildes auf Englisch).
- Für Icons: Gib nur __icon_query__ an (Suchbegriff auf Englisch).
- Keine Emojis im Inhalt.
- Kennzahlen sollten kurz und prägnant sein.
- Speaker Notes sollen einfacher Text sein, kein Markdown.

Layout-Typ: ${slideOutline.suggestedLayout}
${!useStrictSchema ? `Erwartete Felder:\n${layoutFields}` : ''}`;

    const crossSlideContext = buildCrossSlideContext(completedSlides, i, outline.slides.length);

    const slidePrompt = `Präsentation: "${outline.title}"
Folientitel: "${slideOutline.title}"
Folieninhalt-Beschreibung: ${slideOutline.content}${crossSlideContext}`;

    try {
      let content: Record<string, unknown>;
      let speakerNote: string | null = null;

      if (useStrictSchema && responseJsonSchema) {
        // Use strict JSON schema — AI is forced to match the layout structure
        const result = await generateObject({
          model,
          schema: jsonSchema(responseJsonSchema),
          system: systemPrompt,
          prompt: slidePrompt,
          temperature: 0.5,
        });

        const rawContent = result.object as Record<string, unknown>;
        speakerNote =
          typeof rawContent.__speaker_note__ === 'string' ? rawContent.__speaker_note__ : null;
        delete rawContent.__speaker_note__;
        content = normalizeAIContent(rawContent) as Record<string, unknown>;
      } else {
        // Fallback: loose schema with natural-language field descriptions
        const result = await generateObject({
          model,
          schema: SlideContentSchema,
          system: systemPrompt,
          prompt: slidePrompt,
          temperature: 0.5,
        });
        content = normalizeAIContent(result.object.content) as Record<string, unknown>;
        speakerNote = result.object.speakerNote;
      }

      console.log(`[slides-graph] contentNode slide ${i + 1} generated`, {
        contentKeys: Object.keys(content),
        contentSample: JSON.stringify(content).slice(0, 300),
        hasSpeakerNote: !!speakerNote,
        usedStrictSchema: useStrictSchema,
      });

      slides.push({
        index: i,
        layoutGroup: layoutInfo.layoutGroup,
        layout: layoutInfo.layout,
        suggestedLayout: slideOutline.suggestedLayout,
        content,
        speakerNote,
      });

      const title = typeof content.title === 'string' ? content.title : slideOutline.title;
      const description =
        typeof content.description === 'string'
          ? (content.description as string).slice(0, 80)
          : slideOutline.content.slice(0, 80);

      completedSlides.push({ title, description });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[slides-graph] contentNode slide ${i + 1} FAILED, using fallback:`, message);

      const fallbackContent: Record<string, unknown> = {
        title: slideOutline.title,
        description: slideOutline.content,
      };

      slides.push({
        index: i,
        layoutGroup: layoutInfo.layoutGroup,
        layout: layoutInfo.layout,
        suggestedLayout: slideOutline.suggestedLayout,
        content: fallbackContent,
        speakerNote: null,
      });

      completedSlides.push({
        title: slideOutline.title,
        description: slideOutline.content.slice(0, 80),
      });
    }
  }

  const contentTimeMs = Date.now() - startTime;

  console.log('[slides-graph] contentNode completed', {
    slideCount: slides.length,
    contentTimeMs,
    summary: slides.map((s) => ({
      index: s.index,
      layout: s.layout,
      contentKeys: Object.keys(s.content),
    })),
  });

  return { slides, contentTimeMs };
}
