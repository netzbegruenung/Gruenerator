/**
 * Schema-only export path for @gruenerator/slides.
 * No React imports — safe to use in backend/Node.js contexts.
 */
import * as z from 'zod/v4';

import {
  Schema as AgendaSchema,
  layoutId as AgendaId,
} from '../components/layouts/gruene/AgendaSlide.schema.js';
import {
  Schema as BrandedMessageSchema,
  layoutId as BrandedMessageId,
} from '../components/layouts/gruene/BrandedMessageSlide.schema.js';
import {
  Schema as ChartSchema,
  layoutId as ChartId,
} from '../components/layouts/gruene/ChartSlide.schema.js';
import {
  Schema as FullBleedImageSchema,
  layoutId as FullBleedImageId,
} from '../components/layouts/gruene/FullBleedImageSlide.schema.js';
import {
  Schema as IntroSchema,
  layoutId as IntroId,
} from '../components/layouts/gruene/IntroSlide.schema.js';
import {
  Schema as TextImageLeftSchema,
  layoutId as TextImageLeftId,
} from '../components/layouts/gruene/TextImageLeftSlide.schema.js';
import {
  Schema as TextImageRightSchema,
  layoutId as TextImageRightId,
} from '../components/layouts/gruene/TextImageRightSlide.schema.js';
import {
  Schema as TextOnlySchema,
  layoutId as TextOnlyId,
} from '../components/layouts/gruene/TextOnlySlide.schema.js';
import {
  Schema as ThankYouContactSchema,
  layoutId as ThankYouContactId,
} from '../components/layouts/gruene/ThankYouContactSlide.schema.js';
import {
  Schema as TitleImageSchema,
  layoutId as TitleImageId,
} from '../components/layouts/gruene/TitleImageSlide.schema.js';

// ── Build the schema map ─────────────────────────────────────────────────────

type SchemaEntry = [group: string, layoutId: string, schema: z.ZodTypeAny];

const entries: SchemaEntry[] = [
  ['gruene', AgendaId, AgendaSchema],
  ['gruene', BrandedMessageId, BrandedMessageSchema],
  ['gruene', ChartId, ChartSchema],
  ['gruene', FullBleedImageId, FullBleedImageSchema],
  ['gruene', IntroId, IntroSchema],
  ['gruene', TextImageLeftId, TextImageLeftSchema],
  ['gruene', TextImageRightId, TextImageRightSchema],
  ['gruene', TextOnlyId, TextOnlySchema],
  ['gruene', ThankYouContactId, ThankYouContactSchema],
  ['gruene', TitleImageId, TitleImageSchema],
];

/**
 * Map from full layout ID (`"gruene:b90-*"`) to Zod schema.
 * Mirrors the IDs produced by `createTemplateEntry` in the layouts registry.
 */
export const layoutSchemaMap: Map<string, z.ZodTypeAny> = new Map(
  entries.map(([group, layoutId, schema]) => [`${group}:${layoutId}`, schema])
);

/**
 * Look up the Zod schema for a given full layout ID (e.g. `"gruene:b90-intro-slide"`).
 * Returns `undefined` if the layout ID is not found.
 */
export function getLayoutSchema(layoutId: string): z.ZodTypeAny | undefined {
  return layoutSchemaMap.get(layoutId);
}

/**
 * Get all registered layout IDs.
 */
export function getAllLayoutIds(): string[] {
  return [...layoutSchemaMap.keys()];
}
