import { describe, it, expect } from 'vitest';

import ToolHandler from '../../../services/tools/index.js';
import { buildAiSdkTools } from '../adapterUtils.js';

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
});
