import { describe, it, expect } from 'vitest';

import { chatStreamEventSchemas } from '@gruenerator/contracts';

import { formatNamespacedToolLabel } from '../../lib/toolMappings';

/**
 * Wire-contract additions for the agentic tool loop: the `intent` event carries
 * an optional `agentic` flag (so the parser skips the fabricated tool card), and
 * the `tool_step_*` events gain title/serverName/result for real tool cards.
 * These pin that the gate accepts the new shapes (and keeps them via passthrough)
 * so the parser can read them.
 */
describe('agentic wire additions', () => {
  it('intent accepts the agentic flag and keeps it', () => {
    const schema = chatStreamEventSchemas['intent']!;
    const parsed = schema.safeParse({ intent: 'search', message: 'Los...', agentic: true });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).agentic).toBe(true);
    }
  });

  it('intent without the flag still validates (backwards compatible)', () => {
    const schema = chatStreamEventSchemas['intent']!;
    expect(schema.safeParse({ intent: 'search', message: 'x' }).success).toBe(true);
  });

  it('tool_step_start accepts title + serverName', () => {
    const schema = chatStreamEventSchemas['tool_step_start']!;
    const parsed = schema.safeParse({
      stepId: 's1',
      toolName: 's0__search',
      args: { query: 'x' },
      title: 'Suche…',
      serverName: 'Notion',
    });
    expect(parsed.success).toBe(true);
  });

  it('tool_step_result accepts a rich result payload', () => {
    const schema = chatStreamEventSchemas['tool_step_result']!;
    const parsed = schema.safeParse({
      stepId: 's1',
      toolName: 'gruenerator_search',
      ok: true,
      summary: '3 Ergebnisse',
      result: { results: [{ title: 'A' }], sources: '[1] A' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const data = parsed.data as { result?: { results?: unknown[] } };
      expect(data.result?.results).toHaveLength(1);
    }
  });

  it('tool_step_result still requires stepId/toolName/ok', () => {
    const schema = chatStreamEventSchemas['tool_step_result']!;
    expect(schema.safeParse({ stepId: 's1' }).success).toBe(false);
  });
});

describe('formatNamespacedToolLabel', () => {
  it('strips the MCP namespace and prepends the server name', () => {
    expect(formatNamespacedToolLabel('s0__search', 'Notion')).toBe('Notion · search');
    expect(formatNamespacedToolLabel('s12__create_page', 'Brevo')).toBe('Brevo · create_page');
  });

  it('passes internal tool names through unchanged', () => {
    expect(formatNamespacedToolLabel('gruenerator_search')).toBe('gruenerator_search');
  });

  it('handles a namespaced name without a server label', () => {
    expect(formatNamespacedToolLabel('s3__lookup')).toBe('lookup');
  });
});
