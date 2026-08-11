import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';

import {
  RETRY_LIMIT,
  RETRY_TEXT,
  isValidToolName,
  sanitizeToolCallsMiddleware,
} from './sanitizeToolCalls.js';

/**
 * The bug this guards against is not visible in the turn that causes it: the
 * malformed call executes nothing, and the run only dies on the NEXT request,
 * when the poisoned history is echoed back and the API answers 400. So the
 * assertions are about what stays in `messages`, not about a return value.
 */

interface MiddlewareResult {
  messages?: unknown[];
  jumpTo?: string;
}

const afterModel = sanitizeToolCallsMiddleware.afterModel as {
  canJumpTo?: string[];
  hook: (state: { messages?: unknown[] }) => MiddlewareResult | undefined;
};
const hook = afterModel.hook;

function call(name: unknown, id = 'call-1') {
  return { name, args: {}, id, type: 'tool_call' };
}

function aiWith(calls: unknown[], id = 'msg-1'): AIMessage {
  return new AIMessage({ id, content: '', tool_calls: calls as never });
}

describe('isValidToolName', () => {
  it('accepts the names our own tools use', () => {
    for (const name of ['web_suche', 'tiefen_suche', 'seite_lesen', 'write_file', 'task']) {
      expect(isValidToolName(name)).toBe(true);
    }
  });

  it('rejects the joined-index shape Mistral Medium emits', () => {
    expect(isValidToolName('1,2,5')).toBe(false);
    expect(isValidToolName('2,4,6')).toBe(false);
  });

  it('rejects non-strings and the empty string', () => {
    expect(isValidToolName(undefined)).toBe(false);
    expect(isValidToolName(null)).toBe(false);
    expect(isValidToolName(42)).toBe(false);
    expect(isValidToolName('')).toBe(false);
  });

  it('rejects a name past the 64-character limit', () => {
    expect(isValidToolName('a'.repeat(64))).toBe(true);
    expect(isValidToolName('a'.repeat(65))).toBe(false);
  });
});

describe('sanitizeToolCallsMiddleware', () => {
  it('leaves a clean turn untouched, so nothing is rewritten needlessly', () => {
    expect(hook({ messages: [aiWith([call('web_suche')])] })).toBeUndefined();
  });

  it('ignores turns with no tool calls and non-AI last messages', () => {
    expect(hook({ messages: [aiWith([])] })).toBeUndefined();
    expect(hook({ messages: [new HumanMessage('hallo')] })).toBeUndefined();
    expect(hook({ messages: [] })).toBeUndefined();
    expect(hook({})).toBeUndefined();
  });

  it('drops only the malformed call and keeps the usable one', () => {
    const result = hook({
      messages: [aiWith([call('web_suche', 'a'), call('1,2,5', 'b')])],
    });

    const repaired = result?.messages?.[0] as AIMessage;
    expect(repaired.tool_calls?.map((c) => c.name)).toEqual(['web_suche']);
    expect(result?.messages).toHaveLength(1);
  });

  it('reuses the message id, so the reducer replaces instead of appending', () => {
    const result = hook({ messages: [aiWith([call('1,2,5')], 'msg-42')] });

    expect((result?.messages?.[0] as AIMessage).id).toBe('msg-42');
  });

  it('nudges the model when every call was garbage, instead of ending the turn silently', () => {
    const result = hook({ messages: [aiWith([call('1,2'), call('3,4')])] });

    expect(result?.messages).toHaveLength(2);
    expect((result?.messages?.[0] as AIMessage).tool_calls).toEqual([]);
    const nudge = result?.messages?.[1] as HumanMessage;
    expect(nudge).toBeInstanceOf(HumanMessage);
    expect(nudge.content).toContain('einzeln');
  });

  it('stops jumping after the retry limit, so a permanently broken model cannot burn the run', () => {
    const history = [
      ...Array.from({ length: RETRY_LIMIT }, () => new HumanMessage(RETRY_TEXT)),
      aiWith([call('1,2')]),
    ];

    const result = hook({ messages: history });

    expect(result?.jumpTo).toBeUndefined();
    expect(result?.messages).toHaveLength(1);
    expect((result?.messages?.[0] as AIMessage).tool_calls).toEqual([]);
  });

  it('still jumps below the limit', () => {
    const result = hook({ messages: [new HumanMessage(RETRY_TEXT), aiWith([call('1,2')])] });

    expect(result?.jumpTo).toBe('model');
  });

  it('does not count unrelated user messages against the limit', () => {
    const history = [
      new HumanMessage('Recherchiere bitte X'),
      new HumanMessage('und auch Y'),
      aiWith([call('1,2')]),
    ];

    expect(hook({ messages: history })?.jumpTo).toBe('model');
  });

  it('jumps back to the model on the all-garbage nudge — the message alone would not reroute', () => {
    const result = hook({ messages: [aiWith([call('1,2')])] });

    expect(result?.jumpTo).toBe('model');
    expect(afterModel.canJumpTo).toContain('model');
  });

  it('does not jump on a partial repair, where the kept call routes to tools normally', () => {
    const result = hook({ messages: [aiWith([call('web_suche', 'a'), call('1,2', 'b')])] });

    expect(result?.jumpTo).toBeUndefined();
  });

  it('keeps the assistant text of the repaired message', () => {
    const message = new AIMessage({
      id: 'msg-1',
      content: 'Ich suche jetzt nach Zahlen.',
      tool_calls: [call('1,2,5')] as never,
    });

    const repaired = hook({ messages: [message] })?.messages?.[0] as AIMessage;

    expect(repaired.content).toBe('Ich suche jetzt nach Zahlen.');
  });
});
