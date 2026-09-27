/**
 * `ToolHandler.formatToolsForProvider`: the provider gate.
 *
 * Until 28.08.2026 the gate was a hand-written list `['litellm', 'mistral']`
 * (Issue #3044). Every other lane — regolo, greenpt, scaleway, cortecs — fell
 * into the "Unknown provider" branch, warned once per tool, and kept shipping
 * Claude-shaped tools as-is. All lanes speak the OpenAI wire format
 * (see providerInstances.ts), so every known provider gets the nested
 * `function` shape, and only a name outside the catalogue reaches the warning.
 */
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ToolHandler from '../index.js';
import { PROVIDER_NAMES } from '../../ai/providers.js';
import { buildAiSdkTools, resolveToolChoice } from '../../ai/execution/adapterUtils.js';

import type { AIProvider, OpenAITool, Tool } from '../types.js';

// Claude-shaped, the shape the production pipeline actually hands over
// (see buildAiSdkTools' doc). Two tools, so the once-per-call warning is
// observable — the pre-#3044 code warned once per tool.
const CATALOG: Tool[] = [
  {
    name: 'doc_generation',
    description: 'Erstellt ein Dokument auf Basis des übergebenen Themas.',
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'Thema des Dokuments' } },
      required: ['topic'],
    },
  },
  {
    name: 'sharepic_edit',
    description: 'Editiert ein Sharepic.',
    input_schema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Slug des Sharepics' } },
      required: ['slug'],
    },
  },
];

describe('formatToolsForProvider', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it.each(PROVIDER_NAMES)(
    'converts Claude-shaped tools to the nested OpenAI shape for %s without warning',
    (provider) => {
      const formatted = ToolHandler.formatToolsForProvider(CATALOG, provider);
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Unknown provider'));
      const names = ['doc_generation', 'sharepic_edit'];
      formatted.forEach((tool, i) => {
        const openai = tool as OpenAITool;
        expect(openai.type).toBe('function');
        expect(openai.function?.name).toBe(names[i]);
        // The flat Claude fields must not survive the conversion.
        expect('name' in openai).toBe(false);
        expect('input_schema' in openai).toBe(false);
      });
    }
  );

  it('emits exactly the nested shape the OpenAI wire format expects', () => {
    const [first] = ToolHandler.formatToolsForProvider(CATALOG, 'greenpt');
    expect(first).toEqual({
      type: 'function',
      function: {
        name: 'doc_generation',
        description: 'Erstellt ein Dokument auf Basis des übergebenen Themas.',
        parameters: {
          type: 'object',
          properties: { topic: { type: 'string', description: 'Thema des Dokuments' } },
          required: ['topic'],
        },
      },
    });
  });

  it.each(PROVIDER_NAMES)('leaves OpenAI-shaped tools untouched for %s', (provider) => {
    const openai: Tool = {
      type: 'function',
      function: {
        name: 'doc_generation',
        description: 'x',
        parameters: { type: 'object', properties: {} },
      },
    };
    expect(ToolHandler.formatToolsForProvider([openai], provider)[0]).toBe(openai);
  });

  // `isProviderConfigured` special-cases 'anthropic' (the retired Bedrock
  // route), so a non-catalogue name can still reach the gate at runtime.
  it('warns once and passes through when the name is not a provider lane', () => {
    const formatted = ToolHandler.formatToolsForProvider(
      CATALOG,
      'anthropic' as unknown as AIProvider
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown provider: anthropic'));
    expect(formatted).toBe(CATALOG);
  });
});

describe('prepareToolsPayload', () => {
  it.each(PROVIDER_NAMES)('keeps the nested tools and tool_choice for %s', (provider) => {
    const payload = ToolHandler.prepareToolsPayload(
      { tools: CATALOG, tool_choice: 'required' },
      provider,
      'req',
      'test'
    );
    expect(payload.tool_choice).toBe('required');
    expect(payload.tools?.[0]).toEqual({
      type: 'function',
      function: {
        name: 'doc_generation',
        description: 'Erstellt ein Dokument auf Basis des übergebenen Themas.',
        parameters: {
          type: 'object',
          properties: { topic: { type: 'string', description: 'Thema des Dokuments' } },
          required: ['topic'],
        },
      },
    });
  });
});

/**
 * What the OpenAI SDK actually puts on the wire, for the four lanes whose tool
 * shape #3044 changed (litellm was already converted before; mistral
 * serialises through @ai-sdk/mistral, not this code path). Capturing fetch +
 * real `generateText` with `toolChoice: 'required'`, because the issue's trap
 * is not "does the array come back differently" but "does a forced tool call
 * actually go through".
 */
describe('wire shape (OpenAI serialisation)', () => {
  const CHANGED_LANES = ['regolo', 'greenpt', 'scaleway', 'cortecs'] as const;

  it.each(CHANGED_LANES)('sends a forced tool call for %s', async (provider) => {
    const captured: { body: Record<string, unknown> }[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      captured.push({ body: JSON.parse(String(init?.body)) });
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: 0,
          model: 'stub-model',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'doc_generation',
                      arguments: JSON.stringify({ topic: 'Klimapolitik in der EU' }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const payload = ToolHandler.prepareToolsPayload(
      { tools: CATALOG, tool_choice: 'required' },
      provider,
      'req',
      'test'
    );
    const model = createOpenAI({
      apiKey: 'sk-test',
      baseURL: 'http://wire-shape.invalid/v1',
      fetch: fetcher,
    }).chat('stub-model');

    const result = await generateText({
      model,
      messages: [{ role: 'user', content: 'Erstelle ein Dokument über Klimapolitik in der EU.' }],
      tools: buildAiSdkTools(payload),
      toolChoice: resolveToolChoice(payload.tool_choice),
    });

    const body = captured[0]?.body;
    expect(body?.tool_choice).toBe('required');
    expect(body?.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'doc_generation',
          description: 'Erstellt ein Dokument auf Basis des übergebenen Themas.',
          parameters: {
            type: 'object',
            properties: { topic: { type: 'string', description: 'Thema des Dokuments' } },
            required: ['topic'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'sharepic_edit',
          description: 'Editiert ein Sharepic.',
          parameters: {
            type: 'object',
            properties: { slug: { type: 'string', description: 'Slug des Sharepics' } },
            required: ['slug'],
          },
        },
      },
    ]);
    // The forced call round-trips through the real SDK.
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.toolName).toBe('doc_generation');
  });
});
