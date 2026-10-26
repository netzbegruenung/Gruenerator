/**
 * The JSON Schema a zod schema becomes when it describes a tool or an
 * `aiObject` result to a model.
 *
 * zod 4 converts natively; `zod-to-json-schema` only understands zod 3 and
 * returns an empty `{"$schema": …}` for a zod 4 schema without any error.
 * Three adjustments keep the output what zod-to-json-schema sent before the
 * zod 4 migration (compared schema by schema on every call site):
 * - `io: 'output'`: plain objects get `additionalProperties: false`, as before.
 * - `oneOf` becomes `anyOf`: zod 4 writes a discriminated union as `oneOf`,
 *   and `anyOf` is what was measured to survive forced tool calls on Gemma
 *   (Melious, Cortecs) and Mistral Large 4 (see sharepicCreator/toolSchema.ts).
 * - `.int()` no longer brings ±MAX_SAFE_INTEGER as `minimum`/`maximum`.
 */

import { z } from 'zod';

function asBefore(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(asBefore);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node as Record<string, unknown>)
      .filter(
        ([key, value]) =>
          !(
            (key === 'minimum' && value === Number.MIN_SAFE_INTEGER) ||
            (key === 'maximum' && value === Number.MAX_SAFE_INTEGER)
          )
      )
      .map(([key, value]) => [
        key === 'oneOf' ? 'anyOf' : key,
        // Property names are data, not keywords: a field called `oneOf` stays.
        key === 'properties' && value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value as Record<string, unknown>).map(([name, schema]) => [
                name,
                asBefore(schema),
              ])
            )
          : asBefore(value),
      ])
  );
}

export function toolInputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return asBefore(
    z.toJSONSchema(schema, { target: 'draft-07', io: 'output', unrepresentable: 'any' })
  ) as Record<string, unknown>;
}
