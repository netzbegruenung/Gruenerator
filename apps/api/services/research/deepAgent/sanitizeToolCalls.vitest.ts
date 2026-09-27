import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';

import {
  RETRY_LIMIT,
  RETRY_TEXT,
  isValidToolName,
  sanitizeAdditionalKwargs,
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

describe('sanitizeAdditionalKwargs', () => {
  const good = { id: 'a', type: 'function', function: { name: 'web_suche', arguments: '{}' } };
  const bad = { id: 'b', type: 'function', function: { name: '2,4,6', arguments: '{}' } };

  it('returns the SAME array when nothing was dropped, so a clean turn is not rewritten', () => {
    const raw = [good];

    expect(sanitizeAdditionalKwargs({ tool_calls: raw }).tool_calls).toBe(raw);
  });

  it('removes the key entirely when nothing survives', () => {
    // Not an empty array: the converter branches on `!= null`, so `[]` would
    // still beat the parsed calls and send an empty tool_calls list.
    expect('tool_calls' in sanitizeAdditionalKwargs({ tool_calls: [bad] })).toBe(false);
  });

  it('leaves unrelated kwargs alone', () => {
    expect(sanitizeAdditionalKwargs({ reasoning: 'x' })).toEqual({ reasoning: 'x' });
    expect(sanitizeAdditionalKwargs(undefined)).toEqual({});
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

  /**
   * The nudge repairs one turn; it must not rewrite the run's strategy. It used
   * to say "nie mehrere gleichzeitig", and because the message stays in the
   * history that standing instruction talked the lead out of parallel
   * delegation for the rest of the run — undoing, via a recovery path, exactly
   * what `PARALLEL_TOOL_CALLS` buys.
   */
  it('scopes the nudge to the failed call instead of banning batching for the rest of the run', () => {
    const result = hook({ messages: [aiWith([call('1,2')])] });
    const nudge = (result?.messages?.[1] as HumanMessage).content as string;

    expect(nudge).toContain('jetzt');
    expect(nudge).not.toMatch(/nie mehrere gleichzeitig/);
    expect(nudge).toMatch(/danach/);
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

  /**
   * The channel the first version missed. `@langchain/openai` sends
   * `additional_kwargs.tool_calls` verbatim whenever `tool_calls` is empty — so
   * the all-garbage case, the one this middleware creates by emptying
   * `tool_calls`, was exactly the case that put the bad name back on the wire.
   */
  it('strips the poisoned name from the raw payload, not just from tool_calls', () => {
    const message = new AIMessage({
      id: 'msg-1',
      content: '',
      tool_calls: [call('2,4,6')] as never,
      additional_kwargs: {
        tool_calls: [{ id: 'x', type: 'function', function: { name: '2,4,6', arguments: '{}' } }],
      },
    });

    const repaired = hook({ messages: [message] })?.messages?.[0] as AIMessage;

    expect(repaired.additional_kwargs.tool_calls).toBeUndefined();
  });

  it('keeps the valid entries of the raw payload', () => {
    const raw = [
      { id: 'a', type: 'function', function: { name: 'web_suche', arguments: '{}' } },
      { id: 'b', type: 'function', function: { name: '1,2', arguments: '{}' } },
    ];
    const message = new AIMessage({
      id: 'msg-1',
      content: '',
      tool_calls: [call('web_suche', 'a')] as never,
      additional_kwargs: { tool_calls: raw },
    });

    const repaired = hook({ messages: [message] })?.messages?.[0] as AIMessage;

    expect(repaired.additional_kwargs.tool_calls).toHaveLength(1);
  });

  it('repairs a message whose bad call only exists as invalid_tool_calls', () => {
    const message = new AIMessage({
      id: 'msg-1',
      content: '',
      tool_calls: [],
      invalid_tool_calls: [{ name: '10,11,15', args: '{}', id: 'z', error: 'x' }],
    });

    const result = hook({ messages: [message] });

    expect((result?.messages?.[0] as AIMessage).invalid_tool_calls).toEqual([]);
    // No executable call is left, so the turn would end here — push it back.
    expect(result?.jumpTo).toBe('model');
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
