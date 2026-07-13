import { jsonSchema, type Tool } from 'ai';

import type { RequestMetadata, ResponseMetadata } from './types.js';

/**
 * Build the Vercel AI SDK `tools` map from a ToolHandler payload.
 *
 * `formatToolsForProvider` emits OpenAI-nested tools
 * (`{type:'function', function:{name,description,parameters}}`); some callers
 * pass flat Claude-ish (`{name,description,input_schema}`). Read both. The raw
 * JSON Schema must be wrapped with `jsonSchema()` — the SDK silently rejects a
 * plain object as `inputSchema`, and reading the wrong (flat) fields off the
 * nested shape produced an unusable `tools.undefined` entry, so the model saw no
 * callable tool and never made a tool call.
 */
export function buildAiSdkTools(toolsPayload: {
  tools?: unknown[] | undefined;
}): Record<string, Tool> | undefined {
  if (!toolsPayload.tools || toolsPayload.tools.length === 0) return undefined;
  const tools: Record<string, Tool> = {};
  for (const raw of toolsPayload.tools as Array<Record<string, unknown>>) {
    const fn = ((raw.function as Record<string, unknown> | undefined) ?? raw) as {
      name?: string;
      description?: string;
      parameters?: unknown;
      input_schema?: unknown;
    };
    if (!fn.name) continue;
    const schema = (fn.parameters ??
      fn.input_schema ?? { type: 'object', properties: {} }) as Parameters<typeof jsonSchema>[0];
    tools[fn.name] = {
      description: fn.description ?? '',
      inputSchema: jsonSchema(schema),
    };
  }
  return Object.keys(tools).length > 0 ? tools : undefined;
}

export function mergeMetadata(
  requestMetadata: RequestMetadata = {},
  responseMetadata: ResponseMetadata
): ResponseMetadata & RequestMetadata {
  return {
    ...requestMetadata,
    ...responseMetadata,
    provider: responseMetadata.provider,
    model: responseMetadata.model,
    timestamp: responseMetadata.timestamp,
  };
}
