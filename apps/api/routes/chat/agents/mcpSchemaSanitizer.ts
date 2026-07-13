/**
 * Sanitize an MCP tool's raw JSON Schema so Mistral's function-calling API
 * accepts it. The agentic loop is Mistral-only, and Mistral rejects several
 * JSON-Schema constructs an MCP server may emit — most importantly `$ref`/`$defs`
 * references (it doesn't resolve them). We can't reliably inline refs, so a
 * referenced node degrades to a permissive `{}` (the property stays callable,
 * only its constraint is dropped).
 *
 * Rules:
 *  - drop meta keywords (`$schema`, `$id`, `$comment`, `$defs`, `definitions`);
 *  - replace any node carrying `$ref` with `{}`;
 *  - recurse through `properties`, `items`, and the `anyOf/oneOf/allOf` combiners;
 *  - guarantee an object root with a `properties` map (Mistral tool params must
 *    be an object schema).
 */
import type { JSONSchema7 } from 'ai';

const DROP_KEYS = new Set(['$schema', '$id', '$comment', '$defs', 'definitions']);

function sanitizeNode(node: unknown, depth: number): unknown {
  if (depth > 12 || node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((n) => sanitizeNode(n, depth + 1));

  const obj = node as Record<string, unknown>;
  // A referenced node can't be resolved for Mistral — drop the constraint.
  if ('$ref' in obj) return {};

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DROP_KEYS.has(key)) continue;
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      const props: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(value as Record<string, unknown>)) {
        props[propName] = sanitizeNode(propSchema, depth + 1);
      }
      out.properties = props;
    } else if (key === 'items' || key === 'additionalProperties') {
      out[key] = sanitizeNode(value, depth + 1);
    } else if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      out[key] = Array.isArray(value)
        ? value.map((n) => sanitizeNode(n, depth + 1))
        : sanitizeNode(value, depth + 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Returns a Mistral-safe object schema for an MCP tool's inputSchema. */
export function sanitizeMcpSchema(raw: Record<string, unknown> | undefined | null): JSONSchema7 {
  const sanitized = sanitizeNode(raw ?? {}, 0);
  const result: Record<string, unknown> =
    sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
      ? (sanitized as Record<string, unknown>)
      : {};
  // Mistral tool parameters must be an object schema with a properties map.
  result.type = 'object';
  if (!result.properties || typeof result.properties !== 'object') result.properties = {};
  return result as JSONSchema7;
}
