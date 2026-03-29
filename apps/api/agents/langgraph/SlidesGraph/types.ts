/**
 * SlidesGraph Type Definitions
 *
 * Defines the state structure, constants, schemas, and types for the
 * LangGraph-based slide generation pipeline.
 *
 * Graph flow:
 *   START → outline → content → validate → [correct|finalize] → END
 */

import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';

import { getModel, isProviderConfigured } from '../../../services/ai/providers.js';
import { createLogger } from '../../../utils/logger.js';

import type { LanguageModel } from 'ai';

const log = createLogger('SlidesGraph');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maps outline layout names to concrete layoutGroup + layout identifiers. */
export const LAYOUT_MAP: Record<string, { layoutGroup: string; layout: string }> = {
  intro: { layoutGroup: 'general', layout: 'general:general-intro-slide' },
  'basic-info': { layoutGroup: 'general', layout: 'general:basic-info-slide' },
  'bullet-points': {
    layoutGroup: 'neo-general',
    layout: 'neo-general:headline-text-with-stats-layout',
  },
  'bullet-with-icons': { layoutGroup: 'general', layout: 'general:bullet-with-icons-slide' },
  metrics: { layoutGroup: 'general', layout: 'general:metrics-slide' },
  quote: { layoutGroup: 'general', layout: 'general:quote-slide' },
  table: { layoutGroup: 'general', layout: 'general:table-info-slide' },
  chart: { layoutGroup: 'general', layout: 'general:chart-with-bullets-slide' },
  team: { layoutGroup: 'general', layout: 'general:team-slide' },
  'numbered-bullets': { layoutGroup: 'general', layout: 'general:numbered-bullets-slide' },
  'table-of-contents': { layoutGroup: 'general', layout: 'general:table-of-contents-slide' },
  closing: {
    layoutGroup: 'neo-general',
    layout: 'neo-general:thank-you-contact-info-footer-image-slide-layout',
  },
};

/**
 * Per-layout field specifications — used as fallback when the strict JSON
 * schema cannot be loaded. Must match the actual layout Zod schemas exactly.
 */
export const LAYOUT_FIELD_SPECS: Record<string, string> = {
  intro: `- title: string (max 40 Zeichen)
- description: string (max 150 Zeichen)
- presenterName: string (max 50 Zeichen)
- presentationDate: string (max 50 Zeichen)
- image: Objekt mit {__image_prompt__: string}`,
  'basic-info': `- title: string (max 40 Zeichen)
- description: string (max 150 Zeichen)
- image: Objekt mit {__image_prompt__: string}`,
  'bullet-points': `- title: string (max 30 Zeichen)
- bulletPoints: Array von STRINGS (nicht Objekten!) — jeder String max 160 Zeichen, max 6 Einträge
- metrics: Array von Objekten [{value: string (max 8 Zeichen), label: string (max 10 Zeichen)}]`,
  'bullet-with-icons': `- title: string (max 40 Zeichen)
- description: string (max 150 Zeichen)
- image: Objekt mit {__image_prompt__: string}
- bulletPoints: Array von Objekten [{title: string (max 60 Zeichen), description: string (max 100 Zeichen), icon: Objekt mit {__icon_query__: string}}] (max 3 Einträge)`,
  metrics: `- title: string (max 100 Zeichen)
- metrics: Array von Objekten [{label: string (max 50 Zeichen), value: string (max 10 Zeichen), description: string (max 150 Zeichen)}] (2-3 Einträge)`,
  quote: `- heading: string
- quote: string
- author: string
- backgroundImage: Objekt mit {__image_prompt__: string}`,
  table: `- title: string (max 40 Zeichen)
- tableData: Objekt mit:
  - headers: Array von strings (max 5, je max 30 Zeichen)
  - rows: Array von Arrays mit strings (je max 50 Zeichen pro Zelle, max 6 Zeilen)
- description: string (max 200 Zeichen)`,
  'numbered-bullets': `- title: string (max 40 Zeichen)
- image: Objekt mit {__image_prompt__: string}
- bulletPoints: Array von Objekten [{title: string, description: string}] (max 6 Einträge)`,
  team: `- title: string (max 40 Zeichen)
- members: Array von Objekten [{name: string (max 50 Zeichen), role: string (max 50 Zeichen), image: Objekt mit {__image_prompt__: string}}] (max 5 Einträge)`,
  chart: `- title: string (max 40 Zeichen)
- chartData: Objekt mit {type: "bar"|"line"|"pie"|"area", dataPoints: [{name: string, value: number}]}
- bulletPoints: Array von Objekten [{title: string (max 80 Zeichen), description: string (max 150 Zeichen)}] (max 3 Einträge)`,
  'table-of-contents': `- sections: Array von Objekten [{number: number, title: string (max 80 Zeichen), pageNumber: string (max 10 Zeichen)}]`,
  closing: `- title: string (Abschlusstitel)
- subtitle: string (Zusammenfassung)
- contactInfo: Objekt mit {email: string, phone: string, website: string}`,
};

/** Tone descriptions injected into system prompts. */
export const TONE_DESCRIPTIONS: Record<string, string> = {
  default: '',
  professional: 'Verwende einen professionellen, sachlichen Ton.',
  casual: 'Verwende einen lockeren, zugänglichen Ton.',
  educational: 'Verwende einen erklärenden, lehrreichen Ton.',
  sales_pitch: 'Verwende einen überzeugenden, marketing-orientierten Ton.',
  funny: 'Verwende einen humorvollen, unterhaltsamen Ton.',
};

/** Verbosity hints injected into system prompts. */
export const VERBOSITY_HINTS: Record<string, string> = {
  concise: 'Halte die Texte sehr kurz und prägnant. Maximal 1-2 Sätze pro Punkt.',
  standard: 'Verwende eine ausgewogene Textlänge. 2-3 Sätze pro Punkt.',
  'text-heavy': 'Schreibe ausführliche Texte mit Details und Erklärungen.',
};

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Normalizes AI-generated slide content before storing to DB.
 * Fixes common LLM output quirks so layout components receive clean data.
 */
export function normalizeAIContent(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(normalizeAIContent);

  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj);

  // {text: "value"} → "value"
  if (keys.length === 1 && 'text' in obj && typeof obj.text === 'string') {
    return obj.text;
  }

  // {type: "text", value: "..."} → "..."
  if ('type' in obj && obj.type === 'text' && 'value' in obj && typeof obj.value === 'string') {
    return obj.value;
  }

  // Objects with an array payload — unwrap to the array
  // {items: [...]} or {type: "list", items: [...]} or {list: [...]} or {points: [...]}
  for (const arrayKey of ['items', 'list', 'points']) {
    if (arrayKey in obj && Array.isArray(obj[arrayKey])) {
      return (obj[arrayKey] as unknown[]).map(normalizeAIContent);
    }
  }

  // {0: "a", 1: "b", ...} → ["a", "b", ...]
  if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
    return keys.sort((a, b) => Number(a) - Number(b)).map((k) => normalizeAIContent(obj[k]));
  }

  // Recurse into all values
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = normalizeAIContent(value);
  }
  return result;
}

/**
 * Returns the AI model to use for slide generation.
 * Prefers LiteLLM, falls back to Mistral.
 */
export function getSlideModel(): LanguageModel {
  if (isProviderConfigured('litellm')) return getModel('litellm');
  if (isProviderConfigured('mistral')) return getModel('mistral');
  throw new Error('No AI provider configured for slide generation');
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** Schema for the outline step: high-level slide structure with layout suggestions. */
export const SlideOutlineSchema = z.object({
  title: z.string(),
  slides: z.array(
    z.object({
      title: z.string(),
      content: z.string().describe('Brief outline of what this slide covers'),
      suggestedLayout: z.enum([
        'intro',
        'basic-info',
        'bullet-points',
        'bullet-with-icons',
        'metrics',
        'quote',
        'table',
        'chart',
        'team',
        'numbered-bullets',
        'table-of-contents',
        'closing',
      ]),
    })
  ),
});

/** Schema for per-slide content generation. */
export const SlideContentSchema = z.object({
  content: z.record(z.unknown()).describe('Structured content matching the layout schema'),
  speakerNote: z.string().max(300).nullable(),
});

// ---------------------------------------------------------------------------
// Interface types
// ---------------------------------------------------------------------------

/** A single entry in the presentation outline. */
export interface SlideOutlineEntry {
  title: string;
  content: string;
  suggestedLayout: string;
}

/** The full outline produced by the outline node. */
export interface SlideOutline {
  title: string;
  slides: SlideOutlineEntry[];
}

/** A fully generated slide with resolved layout and content. */
export interface GeneratedSlide {
  index: number;
  layoutGroup: string;
  layout: string;
  suggestedLayout: string;
  content: Record<string, unknown>;
  speakerNote: string | null;
}

/** Validation errors for a specific slide. */
export interface SlideValidationError {
  slideIndex: number;
  errors: string[];
}

/** Options controlling the generation pipeline. */
export interface GenerateOptions {
  content: string;
  nSlides: number;
  language: string;
  tone: string;
  verbosity: string;
  instructions: string | null;
  includeTitleSlide: boolean;
  includeTableOfContents: boolean;
}

// ---------------------------------------------------------------------------
// State annotation
// ---------------------------------------------------------------------------

/**
 * State annotation for the SlidesGraph.
 * Defines how each field is updated when nodes return partial state.
 */
export const SlidesStateAnnotation = Annotation.Root({
  // Input (immutable after initialization)
  options: Annotation<GenerateOptions>({
    reducer: (x, y) => y ?? x,
  }),

  // Outline step output
  outline: Annotation<SlideOutline | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Content step output
  slides: Annotation<GeneratedSlide[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),

  // Validation step output
  validationErrors: Annotation<SlideValidationError[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),

  // Retry tracking for correction loop
  retryCount: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  maxRetries: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 2,
  }),

  // Final output
  presentationTitle: Annotation<string>({
    reducer: (x, y) => y ?? x ?? '',
  }),
  finalSlides: Annotation<GeneratedSlide[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  error: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Timing metadata (milliseconds)
  outlineTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  contentTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  validateTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  correctTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  finalizeTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  startTime: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
});

/** Derived state type from the annotation. */
export type SlidesGraphState = typeof SlidesStateAnnotation.State;
