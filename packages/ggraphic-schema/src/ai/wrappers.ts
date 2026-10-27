// SPDX-License-Identifier: MPL-2.0

/**
 * The shapes that carry operations to and from a model, parameterised by the
 * operation union a host composes (`createCanvasAiOperationSchema`). Field
 * order and bounds are model-facing: they are the JSON schema of the tool
 * call, so a reorder changes the request.
 */
import { z } from 'zod';

import { HexColor } from './operations.js';

/** Random id for a suggestion the model sent without one. */
function randomSuggestionId(): string {
  // The package targets plain ES2022 without DOM or Node typings, so the
  // global is read through a local shape.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `s-${Math.random().toString(36).slice(2, 11)}`;
}

/** The operation-carrying schemas built over one operation union. */
export function createCanvasAiSchemas<TOp extends z.ZodType>(operationSchema: TOp) {
  const suggestion = z.object({
    /**
     * Stable id for React keys + apply-results tracking. Models often omit
     * it; `.default` synthesises one at parse time. The output type is
     * still `string`, so consumers don't need to handle a missing id.
     */
    id: z.string().min(1).default(randomSuggestionId),
    /** Short headline for the suggestion card (max 80 chars). */
    title: z.string().min(1).max(80),
    /** Optional longer explanation of what this suggestion changes. */
    description: z.string().max(280).nullish(),
    operations: z.array(operationSchema).min(1).max(8),
  });

  /** Several alternative suggestions for the person to pick from. */
  const suggestResponse = z.object({
    suggestions: z.array(suggestion).min(0).max(6),
  });

  /** A planner's output: ONE operation batch with a short title. */
  const plannedBatch = z.object({
    title: z.string().min(1).max(80),
    operations: z.array(operationSchema).min(1).max(8),
  });

  /**
   * ONE batch of operations applied immediately (unlike suggestions, which a
   * person picks from). `summary` becomes the version-history label, `reply`
   * the assistant's confirmation text.
   */
  const editResponse = z.object({
    operations: z.array(operationSchema).min(1).max(8),
    /** Version-history label. */
    summary: z.string().min(1).max(120),
    /** Assistant confirmation, 1–2 sentences. */
    reply: z.string().min(1).max(300),
  });

  /**
   * Model output may decline an edit; applied edits still require operations.
   * A fresh array, not `.shape.operations.min(0)`: zod 4 keeps the earlier
   * `.min(1)` next to a later bound instead of replacing it.
   */
  const editDecision = editResponse.extend({
    operations: z.array(operationSchema).max(8),
  });

  /**
   * Deck-level wrapper around the single-page vocabulary: multi-page decks
   * are edited per slide (1-based, slide 1 = cover, last slide = closing).
   * `edit-slide` reuses the page operation schema unchanged, so the per-page
   * interpreter keeps doing the clamping/rejecting.
   */
  const deckOperation = z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('edit-slide'),
      /** 1-based slide number as shown in the snapshot. */
      slide: z.number().int().min(1).max(10),
      operations: z.array(operationSchema).min(1).max(6),
    }),
    z.object({
      kind: z.literal('add-slide'),
      /** Insert after this 1-based slide; defaults to before the closing slide. */
      afterSlide: z.number().int().min(1).max(9).nullish(),
      headline: z.string().min(1),
      subtext: z.string().nullish(),
      subtext2: z.string().nullish(),
    }),
    z.object({
      kind: z.literal('remove-slide'),
      /** 1-based; cover (1) and the closing slide cannot be removed. */
      slide: z.number().int().min(2).max(10),
    }),
  ]);

  return { suggestion, suggestResponse, plannedBatch, editResponse, editDecision, deckOperation };
}

/** The element kinds the core editor can list in a snapshot. */
export const CORE_CANVAS_AI_ELEMENT_KINDS = [
  'illustration',
  'asset',
  'shape',
  'icon',
  'pill-badge',
  'circle-badge',
  'frame',
  'user-image',
  'text',
  'chart',
] as const;

/**
 * Canvas → model input. `elementKinds` is the full, ordered list of kinds a
 * host's snapshot may report (a host inserts its own kinds where they belong).
 */
export function createCanvasAiSnapshotSchema<const K extends readonly [string, ...string[]]>(
  elementKinds: K
) {
  return z.object({
    /** Canvas template id. */
    template: z.string().min(1),
    /** Named text fields the model may target with set-text. */
    textFields: z.array(
      z.object({
        field: z.string().min(1),
        label: z.string().min(1),
        value: z.string(),
      })
    ),
    /** Active color scheme id, if applicable. */
    currentColorScheme: z.string().nullish(),
    /** Active solid background color in #rrggbb, if applicable. */
    currentBackgroundColor: HexColor.nullish(),
    /** Active presentation color mode, if applicable. */
    currentColorMode: z.enum(['light', 'dark']).nullish(),
    /** Canvas size in the element coordinate space (origin top left). */
    canvasSize: z.object({ width: z.number().positive(), height: z.number().positive() }).nullish(),
    /** Existing on-canvas elements the model may reference / remove. */
    elementsSummary: z.array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(elementKinds),
        label: z.string(),
      })
    ),
  });
}

/** Canvas → model prompt context: what a template offers. */
export const canvasAiCapabilitiesSchema = z.object({
  supportedOperations: z.array(z.string().min(1)).min(1),
  colorSchemes: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).nullish(),
  illustrations: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).nullish(),
  assets: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).nullish(),
});

export type CanvasAiCapabilities = z.infer<typeof canvasAiCapabilitiesSchema>;
