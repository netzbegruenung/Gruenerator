/**
 * `runForcedToolCall` is the one place the editor op planners (board/sheet/
 * presentation, #3426) force a single tool call on the facade — extracted out
 * of three copy-pasted attempt loops. These tests cover its own mechanics
 * (retry, extraction, error propagation) generically; the planner-specific
 * behaviour (prompt content, validation, op caps) lives in each planner's own
 * test file, which runs this helper for real against a mocked `aiTools`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const aiTools = vi.fn();
vi.mock('../generate.js', () => ({
  aiTools: (...args: unknown[]) => aiTools(...args),
}));

const { runForcedToolCall } = await import('../forcedToolCall.js');

const inputSchema = z.object({ operations: z.array(z.unknown()) });

const base = {
  lane: 'editor_ops_board',
  toolName: 'apply_x',
  toolDescription: 'Apply a batch of x operations.',
  inputSchema,
};

/** A tool-call-shaped `AiResult`. */
function toolCallResult(input: Record<string, unknown>, toolName = 'apply_x') {
  return {
    success: true,
    content: null,
    stop_reason: 'tool_use',
    tool_calls: [{ name: toolName, input }],
  };
}

/** An `AiResult` where the model answered without calling the forced tool. */
function noToolResult() {
  return { success: true, content: 'ich helfe nicht', stop_reason: 'stop' };
}

beforeEach(() => {
  aiTools.mockReset();
});

describe('runForcedToolCall', () => {
  it('returns the tool input on the first attempt', async () => {
    aiTools.mockResolvedValueOnce(toolCallResult({ operations: [1] }));

    const result = await runForcedToolCall(base);

    expect(result).toEqual({ operations: [1] });
    expect(aiTools).toHaveBeenCalledTimes(1);
  });

  it('also reads a tool call from raw_content_blocks', async () => {
    aiTools.mockResolvedValueOnce({
      success: true,
      content: null,
      stop_reason: 'tool_use',
      raw_content_blocks: [
        { type: 'text', text: 'hm' },
        { type: 'tool_use', name: 'apply_x', input: { operations: [2] } },
      ],
    });

    await expect(runForcedToolCall(base)).resolves.toEqual({ operations: [2] });
  });

  it('ignores a tool call for a different tool name and returns null after exhausting attempts', async () => {
    aiTools.mockResolvedValue(toolCallResult({ operations: [] }, 'some_other_tool'));

    const result = await runForcedToolCall(base);

    expect(result).toBeNull();
    expect(aiTools).toHaveBeenCalledTimes(2);
  });

  it('retries once after a provider error and succeeds', async () => {
    aiTools.mockRejectedValueOnce(new Error('upstream 503'));
    aiTools.mockResolvedValueOnce(toolCallResult({ operations: [3] }));

    const result = await runForcedToolCall(base);

    expect(result).toEqual({ operations: [3] });
    expect(aiTools).toHaveBeenCalledTimes(2);
  });

  it('throws the facade error after every attempt fails', async () => {
    aiTools.mockRejectedValue(new Error('boom'));

    await expect(runForcedToolCall(base)).rejects.toThrow('boom');
    expect(aiTools).toHaveBeenCalledTimes(2);
  });

  it('retries once after a missing tool call and succeeds on the second attempt', async () => {
    aiTools.mockResolvedValueOnce(noToolResult());
    aiTools.mockResolvedValueOnce(toolCallResult({ operations: [4] }));

    const result = await runForcedToolCall(base);

    expect(result).toEqual({ operations: [4] });
    expect(aiTools).toHaveBeenCalledTimes(2);
  });

  it('returns null (without throwing) when no attempt produces the tool call', async () => {
    aiTools.mockResolvedValue(noToolResult());

    const result = await runForcedToolCall(base);

    expect(result).toBeNull();
    expect(aiTools).toHaveBeenCalledTimes(2);
  });

  it('honours a custom attempts count', async () => {
    aiTools.mockRejectedValue(new Error('nope'));

    await expect(runForcedToolCall({ ...base, attempts: 3 })).rejects.toThrow('nope');
    expect(aiTools).toHaveBeenCalledTimes(3);
  });

  it('builds the forced-tool-call request and forwards system/prompt/temperature', async () => {
    aiTools.mockResolvedValueOnce(toolCallResult({ operations: [] }));

    await runForcedToolCall({
      ...base,
      system: 'Systemtext',
      prompt: 'Nutzeranfrage',
      temperature: 0.2,
    });

    const call = aiTools.mock.calls[0][0] as {
      lane: string;
      system: string;
      prompt: string;
      temperature: number;
      toolChoice: string;
      tools: Array<{ name: string; description: string }>;
    };
    expect(call.lane).toBe('editor_ops_board');
    expect(call.system).toBe('Systemtext');
    expect(call.prompt).toBe('Nutzeranfrage');
    expect(call.temperature).toBe(0.2);
    expect(call.toolChoice).toBe('required');
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0]).toMatchObject({
      name: 'apply_x',
      description: 'Apply a batch of x operations.',
    });
  });

  it('omits temperature when not given, and forwards messages instead of prompt', async () => {
    aiTools.mockResolvedValueOnce(toolCallResult({ operations: [] }));

    await runForcedToolCall({
      ...base,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const call = aiTools.mock.calls[0][0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('temperature');
    expect(call).not.toHaveProperty('prompt');
    expect(call.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });
});
