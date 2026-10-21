import { describe, expect, it } from 'vitest';

import {
  RETRY_LIMIT,
  RETRY_TEXT,
  isValidToolName,
  sanitizeHistory,
  sanitizeStep,
} from './sanitizeToolCalls.js';

import type { ModelMessage } from 'ai';

function assistantCalls(...names: string[]): ModelMessage {
  return {
    role: 'assistant',
    content: names.map((name, i) => ({
      type: 'tool-call' as const,
      toolCallId: `${name}-${i}`,
      toolName: name,
      input: {},
    })),
  };
}

function toolResults(...names: string[]): ModelMessage {
  return {
    role: 'tool',
    content: names.map((name, i) => ({
      type: 'tool-result' as const,
      toolCallId: `${name}-${i}`,
      toolName: name,
      output: { type: 'text' as const, value: 'ok' },
    })),
  };
}

const question: ModelMessage = { role: 'user', content: 'Frage' };

describe('isValidToolName', () => {
  it('accepts what the OpenAI-compatible APIs accept', () => {
    expect(isValidToolName('web_suche')).toBe(true);
    expect(isValidToolName('task')).toBe(true);
  });

  it('rejects the joined batch indices Mistral emits', () => {
    expect(isValidToolName('1,2,5')).toBe(false);
    expect(isValidToolName('')).toBe(false);
    expect(isValidToolName(undefined)).toBe(false);
  });
});

describe('sanitizeHistory', () => {
  it('leaves a clean history alone', () => {
    expect(sanitizeHistory([question, assistantCalls('task'), toolResults('task')])).toBeNull();
  });

  it('drops the poisoned call AND the result that answered it', () => {
    // A result without its call is the same 400 as the call itself.
    const result = sanitizeHistory([
      question,
      assistantCalls('task', '1,2,5'),
      toolResults('task', '1,2,5'),
    ]);

    expect(result?.dropped).toEqual(['"1,2,5"']);
    expect(JSON.stringify(result?.messages)).not.toContain('1,2,5');
    expect(JSON.stringify(result?.messages)).toContain('task-0');
    expect(result?.lastTurnEmptied).toBe(false);
  });

  it('removes a turn that had nothing else, and says so', () => {
    const result = sanitizeHistory([question, assistantCalls('1,2,5'), toolResults('1,2,5')]);

    expect(result?.messages).toEqual([question]);
    expect(result?.lastTurnEmptied).toBe(true);
  });

  it('keeps the text a turn carried next to its poisoned call', () => {
    const turn: ModelMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Ich vergebe die Teilfragen.' },
        { type: 'tool-call', toolCallId: 'x', toolName: '2,4,6', input: {} },
      ],
    };
    const result = sanitizeHistory([question, turn]);

    expect(result?.messages[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Ich vergebe die Teilfragen.' }],
    });
    expect(result?.lastTurnEmptied).toBe(true);
  });
});

describe('sanitizeStep', () => {
  it('overrides nothing on a clean history', () => {
    expect(sanitizeStep({ messages: [question] })).toBeUndefined();
  });

  it('asks for the call again when the whole turn was garbage', () => {
    const out = sanitizeStep({
      messages: [question, assistantCalls('1,2,5'), toolResults('1,2,5')],
    });

    expect(out?.messages.at(-1)).toEqual({ role: 'user', content: RETRY_TEXT });
  });

  it('does not ask when a valid call survived', () => {
    const out = sanitizeStep({
      messages: [question, assistantCalls('task', '1,2,5'), toolResults('task', '1,2,5')],
    });

    expect(out?.messages.at(-1)?.role).toBe('tool');
  });

  it('stops asking after the limit, but still repairs', () => {
    const asked: ModelMessage[] = Array.from({ length: RETRY_LIMIT }, () => ({
      role: 'user' as const,
      content: RETRY_TEXT,
    }));
    const out = sanitizeStep({ messages: [question, ...asked, assistantCalls('1,2,5')] });

    expect(JSON.stringify(out?.messages)).not.toContain('1,2,5');
    expect(out?.messages.filter((m) => m.content === RETRY_TEXT)).toHaveLength(RETRY_LIMIT);
  });

  it('scopes the nudge to this repair instead of banning batches for the rest of the run', () => {
    // A standing "never call tools in parallel" would undo PARALLEL_TOOL_CALLS
    // for the whole run after one bad batch.
    expect(RETRY_TEXT).toMatch(/jetzt/i);
    expect(RETRY_TEXT).toMatch(/danach/i);
  });
});
