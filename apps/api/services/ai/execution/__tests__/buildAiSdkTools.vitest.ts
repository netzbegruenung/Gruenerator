import { jsonSchema } from 'ai';
import { describe, it, expect } from 'vitest';

import ToolHandler from '../../../tools/index.js';
import { buildAiSdkTools, resolveToolChoice } from '../adapterUtils.js';

// Reproduces the mcpToolNode → prepareToolsPayload → adapter path that silently
// produced `tools.undefined` and made the model never call a tool.
describe('buildAiSdkTools', () => {
  const catalog = [
    {
      name: 's0__get_last_meeting',
      description: '[Sally] Letzte Sitzung abrufen',
      input_schema: {
        type: 'object' as const,
        properties: { limit: { type: 'number' } },
        required: [],
      },
    },
  ];

  it('handles the OpenAI-nested shape formatToolsForProvider emits', () => {
    const payload = ToolHandler.prepareToolsPayload({ tools: catalog }, 'mistral', 'req', 'test');
    const tools = buildAiSdkTools(payload);
    expect(tools).toBeDefined();
    // The bug: key was `undefined`; the fix keys by the real tool name.
    expect(Object.keys(tools!)).toEqual(['s0__get_last_meeting']);
    expect(tools!['s0__get_last_meeting']!.description).toBe('[Sally] Letzte Sitzung abrufen');
    expect(tools!['s0__get_last_meeting']!.inputSchema).toBeDefined();
    expect('undefined' in tools!).toBe(false);
  });

  it('handles the flat Claude-ish shape too', () => {
    const tools = buildAiSdkTools({ tools: catalog });
    expect(Object.keys(tools!)).toEqual(['s0__get_last_meeting']);
  });

  it('returns undefined for empty payloads', () => {
    expect(buildAiSdkTools({})).toBeUndefined();
    expect(buildAiSdkTools({ tools: [] })).toBeUndefined();
  });

  /**
   * `toolForcedEdit` hands over an ALREADY wrapped
   * `input_schema`. Wrapping it a second time here used to send the provider
   * `{"jsonSchema": {…}}` as the parameter schema — no `type`, no `properties`.
   * Live on 02.08.2026 the model followed that shape faithfully and answered
   * `{"jsonSchema":{"title":…,"blocks":[…]}}`, which the PDF/deck validators
   * rejected as "title: Required; blocks: Required".
   */
  it('does not wrap an already-wrapped schema a second time', () => {
    const real = {
      type: 'object' as const,
      properties: { title: { type: 'string' }, blocks: { type: 'array' } },
      required: ['title', 'blocks'],
    };
    const payload = ToolHandler.prepareToolsPayload(
      { tools: [{ name: 'create_pdf', description: 'x', input_schema: jsonSchema(real) }] },
      'mistral',
      'req',
      'test'
    );
    const tools = buildAiSdkTools(payload);
    // What the provider actually receives as `parameters`.
    expect((tools!['create_pdf']!.inputSchema as ReturnType<typeof jsonSchema>).jsonSchema).toEqual(
      real
    );
  });
});

/**
 * `tool_choice` translation, which was copy-pasted into all four adapters and
 * only complete in the Mistral copy: the other three folded "call exactly THIS
 * tool" into `'auto'` — "call one if you like". Nothing passes the object form
 * today, so this changes no live behaviour; it stops a forced tool call from
 * being silently conditional on which provider the fallback chain reached.
 */
describe('resolveToolChoice', () => {
  it('keeps a named tool named', () => {
    expect(resolveToolChoice({ type: 'tool', name: 'sharepic_edit' })).toEqual({
      type: 'tool',
      toolName: 'sharepic_edit',
    });
    // ToolHandler emits `name`; the SDK's own shape uses `toolName`. Read both.
    expect(resolveToolChoice({ type: 'tool', toolName: 'sharepic_edit' })).toEqual({
      type: 'tool',
      toolName: 'sharepic_edit',
    });
  });

  it('passes the plain modes through', () => {
    expect(resolveToolChoice('required')).toBe('required');
    expect(resolveToolChoice('none')).toBe('none');
    expect(resolveToolChoice('auto')).toBe('auto');
  });

  it('treats "tools offered, nothing said" as none', () => {
    // Not 'auto': flipping this would let every request that merely carries a
    // tool catalogue start calling tools.
    expect(resolveToolChoice(undefined)).toBe('none');
  });

  it('falls back to auto for anything else', () => {
    expect(resolveToolChoice('any')).toBe('auto');
    expect(resolveToolChoice({ type: 'function' })).toBe('auto');
  });
});
