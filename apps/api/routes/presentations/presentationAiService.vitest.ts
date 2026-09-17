/**
 * `generatePresentationOperations` calls the shared `runForcedToolCall`
 * (services/ai/forcedToolCall.ts), which calls the facade's `aiTools`.
 * Mocking the facade and running the real (unmocked) helper exercises that
 * shared copy through the presentation planner as well as board/sheet — see
 * services/ai/__tests__/forcedToolCall.vitest.ts for the helper's own
 * retry/extraction mechanics, which are not duplicated here.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const aiTools = vi.fn();
vi.mock('../../services/ai/generate.js', () => ({
  aiTools: (...args: unknown[]) => aiTools(...args),
}));

const { generatePresentationOperations } = await import('./presentationAiService.js');

/** A tool-call-shaped `AiResult` for `applyPresentationOperations`. */
function toolCallResult(operations: unknown[]) {
  return {
    success: true,
    content: null,
    stop_reason: 'tool_use',
    tool_calls: [{ name: 'applyPresentationOperations', input: { operations } }],
  };
}

beforeEach(() => {
  aiTools.mockReset();
});

describe('generatePresentationOperations', () => {
  it('returns validated ops on the happy path', async () => {
    aiTools.mockResolvedValueOnce(
      toolCallResult([
        { type: 'add_slide', layout: 'content', title: 'Argumente', body: '- Eins\n- Zwei' },
      ])
    );

    const ops = await generatePresentationOperations({
      userPrompt: 'Füge eine Folie mit zwei Argumenten hinzu',
      presentationContext: 'Folie 1: Titel',
    });

    expect(ops).toEqual([
      { type: 'add_slide', layout: 'content', title: 'Argumente', body: '- Eins\n- Zwei' },
    ]);
    const call = aiTools.mock.calls[0][0] as { lane: string; tools: Array<{ name: string }> };
    expect(call.lane).toBe('editor_ops_presentation');
    expect(call.tools[0].name).toBe('applyPresentationOperations');
  });

  it('drops an invalid op and keeps the valid ones (per-op leniency)', async () => {
    aiTools.mockResolvedValueOnce(
      toolCallResult([
        { type: 'add_slide', layout: 'content', title: 'Argumente', body: '- Eins' },
        // Missing "slide" — invalid delete_slide, dropped, not fatal.
        { type: 'delete_slide' },
      ])
    );

    const ops = await generatePresentationOperations({
      userPrompt: 'füge eine Folie hinzu und lösche eine andere',
      presentationContext: 'Folie 1: Titel',
    });

    expect(ops).toEqual([
      { type: 'add_slide', layout: 'content', title: 'Argumente', body: '- Eins' },
    ]);
  });
});
