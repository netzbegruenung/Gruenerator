import { tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  absolutizeUrl,
  formatToolResult,
  makeMcpPersonalCtx,
  registerAiTool,
} from './chatToolBridge.js';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// --- helpers -----------------------------------------------------------------

interface RegisteredTool {
  name: string;
  config: {
    description: string;
    inputSchema: z.ZodRawShape;
    annotations?: Record<string, unknown>;
  };
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }>;
}

function fakeServer(): { server: McpServer; tools: Map<string, RegisteredTool> } {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool: (
      name: string,
      config: RegisteredTool['config'],
      handler: RegisteredTool['handler']
    ) => {
      tools.set(name, { name, config, handler });
    },
  } as unknown as McpServer;
  return { server, tools };
}

const sampleTool = () =>
  tool({
    description: 'chat description',
    inputSchema: z.object({
      action: z.enum(['list', 'get', 'delete']),
      id: z.string().optional(),
    }),
    execute: vi.fn(async ({ action }: { action: string }) => ({ ok: true, note: `ran ${action}` })),
  });

// --- makeMcpPersonalCtx ------------------------------------------------------

describe('makeMcpPersonalCtx', () => {
  it('carries the userId and no threadId (SSE-confirm branches must fail safe)', () => {
    const ctx = makeMcpPersonalCtx('user-1');
    expect(ctx.state.agentConfig?.userId).toBe('user-1');
    expect(ctx.threadId).toBeNull();
    expect(ctx.sourceRegistry.register([])).toBe('');
  });
});

// --- formatToolResult --------------------------------------------------------

describe('formatToolResult', () => {
  it('maps {error} to isError text', () => {
    expect(formatToolResult({ error: 'kaputt' })).toEqual({ text: 'kaputt', isError: true });
  });

  it('prefixes needsConfirmation for the two-step confirm protocol', () => {
    const { text, isError } = formatToolResult({ needsConfirmation: true, note: 'Wirklich?' });
    expect(text).toBe('⚠️ Bestätigung erforderlich: Wirklich?');
    expect(isError).toBe(false);
  });

  it('passes ok-notes through', () => {
    expect(formatToolResult({ ok: true, note: 'Erledigt.' })).toEqual({
      text: 'Erledigt.',
      isError: false,
    });
  });

  it('renders result rows as markdown with absolutized URLs', () => {
    const { text } = formatToolResult({
      resultCount: 1,
      results: [{ title: 'Mein Doc', url: '/office/abc', type: 'Dokument', snippet: 'hallo' }],
    });
    expect(text).toContain('**Mein Doc**');
    expect(text).toContain(absolutizeUrl('/office/abc'));
    expect(text).not.toContain('— /office/abc');
  });

  it('absolutizes url fields in the JSON fallback', () => {
    const { text } = formatToolResult({ document: { title: 'X', url: '/document/1' } });
    expect(text).toContain(absolutizeUrl('/document/1'));
  });

  it('reports empty result lists as "Keine Treffer."', () => {
    expect(formatToolResult({ resultCount: 0, results: [] }).text).toBe('Keine Treffer.');
  });
});

// --- registerAiTool ----------------------------------------------------------

describe('registerAiTool', () => {
  it('registers with the chat schema shape and delegates execution', async () => {
    const { server, tools } = fakeServer();
    const aiTool = sampleTool();
    registerAiTool(server, 'documents', aiTool);

    const reg = tools.get('documents');
    expect(reg).toBeDefined();
    expect(reg!.config.description).toBe('chat description');
    expect(Object.keys(reg!.config.inputSchema)).toContain('action');

    const result = await reg!.handler({ action: 'list' });
    expect(aiTool.execute).toHaveBeenCalledWith(
      { action: 'list' },
      expect.objectContaining({ toolCallId: 'mcp-documents' })
    );
    expect(result.content[0].text).toBe('ran list');
    expect(result.isError).toBeUndefined();
  });

  it('narrows the action enum to the granted subset', () => {
    const { server, tools } = fakeServer();
    registerAiTool(server, 'documents', sampleTool(), { actions: ['list', 'get'] });

    const actionSchema = tools.get('documents')!.config.inputSchema.action as z.ZodEnum<
      [string, ...string[]]
    >;
    expect(actionSchema.options).toEqual(['list', 'get']);
    expect(actionSchema.safeParse('delete').success).toBe(false);
  });

  it('routes override actions to the MCP-native handler instead of the chat tool', async () => {
    const { server, tools } = fakeServer();
    const aiTool = sampleTool();
    const override = vi.fn(async () => ({ ok: true, note: 'override ran' }));
    registerAiTool(server, 'documents', aiTool, { overrides: { delete: override } });

    const result = await tools.get('documents')!.handler({ action: 'delete', id: 'x' });
    expect(override).toHaveBeenCalledWith({ action: 'delete', id: 'x' });
    expect(aiTool.execute).not.toHaveBeenCalled();
    expect(result.content[0].text).toBe('override ran');
  });

  it('merges extraShape fields into the input schema', () => {
    const { server, tools } = fakeServer();
    registerAiTool(server, 'notebooks', sampleTool(), {
      extraShape: { query: z.string().optional() },
    });
    expect(Object.keys(tools.get('notebooks')!.config.inputSchema)).toContain('query');
  });

  it('surfaces chat-tool errors as isError content', async () => {
    const { server, tools } = fakeServer();
    const aiTool = tool({
      description: 'x',
      inputSchema: z.object({ action: z.enum(['list']) }),
      execute: async () => ({ error: 'Kein Zugriff.' }),
    });
    registerAiTool(server, 'media', aiTool);

    const result = await tools.get('media')!.handler({ action: 'list' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Kein Zugriff.');
  });

  it('marks read-only tools via annotations', () => {
    const { server, tools } = fakeServer();
    registerAiTool(server, 'find_content', sampleTool(), { readOnly: true });
    expect(tools.get('find_content')!.config.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
  });
});
