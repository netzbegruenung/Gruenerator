import { asSchema, generateText, isStepCount, jsonSchema, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toolsForProvider } from './providerTools.js';

import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function scripted(results: LanguageModelV4GenerateResult['content'][]) {
  return new MockLanguageModelV4({
    doGenerate: results.map((content) => ({
      content,
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    })) as unknown as LanguageModelV4GenerateResult[],
  });
}

describe('toolsForProvider', () => {
  it('sends no $schema marker to the provider and still validates with the zod schema', async () => {
    const seen: unknown[] = [];
    const tools = {
      search: tool({
        description: 'Suche',
        inputSchema: z.object({ query: z.string(), limit: z.number().default(5) }),
        execute: async (input) => {
          seen.push(input);
          return 'ok';
        },
      }),
    };
    const model = scripted([
      [{ type: 'tool-call', toolCallId: 'c1', toolName: 'search', input: '{"query":"Wind"}' }],
      [{ type: 'text', text: 'fertig' }],
    ]);

    await generateText({
      model,
      prompt: 'x',
      tools: toolsForProvider(tools),
      stopWhen: isStepCount(2),
    });

    const sent = model.doGenerateCalls[0].tools?.[0];
    expect(sent).toMatchObject({ type: 'function', name: 'search', description: 'Suche' });
    const params = (sent as { inputSchema: Record<string, unknown> }).inputSchema;
    expect(params).not.toHaveProperty('$schema');
    expect(params).toMatchObject({ type: 'object', required: ['query'] });
    // Validation is the zod schema's: the default is applied before execute.
    expect(seen).toEqual([{ query: 'Wind', limit: 5 }]);
  });

  it('leaves the catalog itself untouched (the MCP bridge reads inputSchema as zod)', () => {
    const inputSchema = z.object({ a: z.string() });
    const tools = { t: tool({ inputSchema, execute: async () => 'ok' }) };
    const out = toolsForProvider(tools);
    expect(tools.t.inputSchema).toBe(inputSchema);
    expect(out.t.execute).toBe(tools.t.execute);
  });

  it('strips the marker from plain JSON schemas too (MCP tools)', async () => {
    const out = toolsForProvider({
      mcp: tool({
        inputSchema: jsonSchema({
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {},
        }),
      }),
    });
    expect(await asSchema(out.mcp.inputSchema).jsonSchema).toEqual({
      type: 'object',
      properties: {},
    });
  });
});
