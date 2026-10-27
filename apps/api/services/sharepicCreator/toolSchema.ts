import { type z } from 'zod';

import { toolInputJsonSchema } from '../ai/toolJsonSchema.js';

/** Content limits stay with the validators, which name them in a repair turn. */
const CONTENT_LIMIT_KEYWORDS = new Set([
  '$schema',
  'additionalProperties',
  'default',
  'pattern',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
]);

function withoutContentLimits(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutContentLimits);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node as Record<string, unknown>)
      .filter(([key]) => !CONTENT_LIMIT_KEYWORDS.has(key))
      .map(([key, value]) => [
        key,
        // Property names are data, not keywords: a field called `maximum` stays.
        key === 'properties' && value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value as Record<string, unknown>).map(([name, schema]) => [
                name,
                withoutContentLimits(schema),
              ])
            )
          : withoutContentLimits(value),
      ])
  );
}

/**
 * The shape of a spec part for a tool schema: every variant with its fields.
 * Gemma on Melious and Cortecs decodes a forced tool call against the schema,
 * and an object without `properties` can only become `{}` — every draft failed
 * with `"background":{},"items":[{}]` (21.10.2026). A bare `{type:'object'}`
 * with the variants in its description does not survive that; `anyOf` does,
 * on both hosts and on Mistral Large 4.
 */
export function structureOf(schema: z.ZodType): Record<string, unknown> {
  return withoutContentLimits(toolInputJsonSchema(schema)) as Record<string, unknown>;
}
