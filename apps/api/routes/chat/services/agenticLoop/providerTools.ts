/**
 * The tool set as it goes to the provider: every `inputSchema` without the
 * top-level `$schema` draft marker the zod → JSON-Schema conversion stamps on
 * (`http://json-schema.org/draft-07/schema#`). It means nothing to the model
 * and costs ~18 prompt tokens per tool on every step (#3725).
 *
 * A per-call copy on purpose: the catalog's `inputSchema` stays a zod object,
 * because `wrapToolsForLoop` promises not to touch it and the MCP bridge
 * (`chatToolBridge.ts`) reads it as one. Validation is the original schema's,
 * so parsed inputs (defaults, transforms) are unchanged.
 */
import { asSchema, jsonSchema, type ToolSet } from 'ai';

export function toolsForProvider(tools: ToolSet): ToolSet {
  const out: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    if (tool.type === 'provider' || tool.inputSchema == null) {
      out[name] = tool;
      continue;
    }
    const schema = asSchema(tool.inputSchema);
    out[name] = {
      ...tool,
      inputSchema: jsonSchema(
        async () => {
          const { $schema: _draft, ...rest } = await schema.jsonSchema;
          return rest;
        },
        schema.validate ? { validate: schema.validate } : {}
      ),
    } as typeof tool;
  }
  return out;
}
