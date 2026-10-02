/**
 * Sanitize an MCP tool's raw JSON Schema so the planner lanes accept it.
 *
 * Mistral doesn't resolve `$ref`/`$defs` references. We can't reliably inline
 * them, so a referenced node degrades to a permissive `{}` (the property stays
 * callable, only its constraint is dropped).
 *
 * Melious `:balanced` (the FI node) validates every tool schema against the
 * JSON-Schema meta-schema and answers anything invalid with a bare
 * `400 „The request was rejected as malformed"` — for the WHOLE request, so one
 * bad property of one tool takes down the turn. Measured 03.10.2026, one tool
 * per request: rejected were draft-04/OpenAPI-style boolean
 * `exclusiveMinimum`/`exclusiveMaximum` (also `false`), numbers sent as strings
 * (`minimum: '0'`, `minItems: '1'`), non-integer lengths, `type: 'file'`,
 * tuple `items: [...]` and `required: true` on a property. `:speed` and
 * everything else in the probe (type arrays, `const`, mixed enums, `$ref`,
 * `if/then`, depth 15, `nullable`, `x-*`) went through. Such schemas come from
 * servers generated off Swagger 2 / OpenAPI 3.0 specs.
 *
 * Rules:
 *  - drop meta keywords (`$schema`, `$id`, `$comment`, `$defs`, `definitions`);
 *  - replace any node carrying `$ref` with `{}`;
 *  - rewrite or drop the keywords the meta-schema rejects (list above);
 *  - recurse through every subschema position; below MAX_DEPTH a node becomes
 *    `{}` rather than passing through unchecked;
 *  - guarantee an object root with a `properties` map (tool params must be an
 *    object schema).
 */
import type { JSONSchema7 } from 'ai';

const MAX_DEPTH = 12;
const DROP_KEYS = new Set(['$schema', '$id', '$comment', '$defs', 'definitions']);
const SCHEMA_KEYS = new Set([
  'items',
  'additionalProperties',
  'not',
  'if',
  'then',
  'else',
  'contains',
  'propertyNames',
  'unevaluatedProperties',
  'unevaluatedItems',
]);
const SCHEMA_ARRAY_KEYS = new Set(['anyOf', 'oneOf', 'allOf', 'prefixItems']);
const SCHEMA_MAP_KEYS = new Set(['properties', 'patternProperties', 'dependentSchemas']);
const NUMBER_KEYS = new Set(['minimum', 'maximum', 'multipleOf']);
const COUNT_KEYS = new Set([
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
]);
const JSON_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);

function asNumber(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeNode(node: unknown, depth: number): unknown {
  if (node === null || typeof node !== 'object') return node;
  if (depth > MAX_DEPTH || Array.isArray(node)) return {};

  const obj = node as Record<string, unknown>;
  // A referenced node can't be resolved for Mistral — drop the constraint.
  if ('$ref' in obj) return {};

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DROP_KEYS.has(key)) continue;
    if (SCHEMA_MAP_KEYS.has(key)) {
      if (!isPlainObject(value)) continue;
      const map: Record<string, unknown> = {};
      for (const [name, schema] of Object.entries(value))
        map[name] = sanitizeNode(schema, depth + 1);
      out[key] = map;
    } else if (SCHEMA_KEYS.has(key)) {
      // Tuple-form `items: [...]` is draft-04; the meta-schema wants one schema.
      if (!Array.isArray(value)) out[key] = sanitizeNode(value, depth + 1);
    } else if (SCHEMA_ARRAY_KEYS.has(key)) {
      if (Array.isArray(value)) out[key] = value.map((n) => sanitizeNode(n, depth + 1));
    } else if (NUMBER_KEYS.has(key)) {
      const n = asNumber(value);
      if (n !== null && (key !== 'multipleOf' || n > 0)) out[key] = n;
    } else if (COUNT_KEYS.has(key)) {
      const n = asNumber(value);
      if (n !== null && Number.isInteger(n) && n >= 0) out[key] = n;
    } else if (key === 'exclusiveMinimum' || key === 'exclusiveMaximum') {
      // The draft-04 boolean form is resolved against its bound below.
      if (typeof value !== 'boolean') {
        const n = asNumber(value);
        if (n !== null) out[key] = n;
      }
    } else if (key === 'type') {
      const types = (Array.isArray(value) ? value : [value]).filter(
        (t): t is string => typeof t === 'string' && JSON_TYPES.has(t)
      );
      if (types.length > 0) out.type = Array.isArray(value) ? types : types[0];
    } else if (key === 'required') {
      // `required: true` on a property is Swagger 2; only the parent's array is valid.
      if (Array.isArray(value)) out.required = value.filter((r) => typeof r === 'string');
    } else {
      out[key] = value;
    }
  }

  // Draft-04 `exclusiveMinimum: true` qualifies `minimum`; 2020-12 carries the bound itself.
  for (const [flag, bound] of [
    ['exclusiveMinimum', 'minimum'],
    ['exclusiveMaximum', 'maximum'],
  ] as const) {
    if (obj[flag] === true && typeof out[bound] === 'number') {
      out[flag] = out[bound];
      delete out[bound];
    }
  }
  return out;
}

/** Returns a planner-safe object schema for an MCP tool's inputSchema. */
export function sanitizeMcpSchema(raw: Record<string, unknown> | undefined | null): JSONSchema7 {
  const sanitized = sanitizeNode(raw ?? {}, 0);
  const result: Record<string, unknown> = isPlainObject(sanitized) ? sanitized : {};
  // Tool parameters must be an object schema with a properties map.
  result.type = 'object';
  if (!isPlainObject(result.properties)) result.properties = {};
  return result as JSONSchema7;
}
