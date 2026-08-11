import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';

import {
  INTERRUPTED_CALL_TEXT,
  WRAP_UP_TEXT,
  buildResumeInput,
  classifyRunError,
} from './resume.js';

/**
 * Guards the resume path: a provider outage or the recursion limit used to
 * forfeit everything a run had already paid for. The classification decides
 * WHETHER to resume, the input builder decides WITH WHAT — and the repaired
 * history must be one the API accepts (no dangling tool calls).
 */

function namedError(name: string, message = 'kaputt'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('classifyRunError', () => {
  it('treats an aborted signal as fatal regardless of the error shape', () => {
    const controller = new AbortController();
    controller.abort();

    expect(classifyRunError(new Error('anything'), controller.signal)).toBe('fatal');
  });

  it('treats abort and timeout errors as fatal even without a signal', () => {
    expect(classifyRunError(namedError('AbortError'))).toBe('fatal');
    expect(classifyRunError(namedError('TimeoutError'))).toBe('fatal');
  });

  it('recognises the recursion limit as its own kind', () => {
    expect(
      classifyRunError(namedError('GraphRecursionError', 'Recursion limit of 60 reached'))
    ).toBe('recursion');
  });

  it('classifies everything else as transient — outages, 400s, network blips', () => {
    expect(classifyRunError(new Error('502 Bad Gateway'))).toBe('transient');
    expect(classifyRunError('string error')).toBe('transient');
  });
});

describe('buildResumeInput', () => {
  it('returns null when the stream died before any state existed', () => {
    expect(buildResumeInput(null, 'transient')).toBeNull();
    expect(buildResumeInput({ messages: [] }, 'transient')).toBeNull();
    expect(buildResumeInput({}, 'transient')).toBeNull();
  });

  it('answers dangling tool calls so the API accepts the resumed history', () => {
    const state = {
      messages: [
        new HumanMessage('Frage'),
        new AIMessage({
          content: '',
          tool_calls: [{ name: 'web_suche', args: {}, id: 'c1', type: 'tool_call' }] as never,
        }),
      ],
    };

    const input = buildResumeInput(state, 'transient');
    const messages = input?.messages as unknown[];

    expect(messages).toHaveLength(3);
    const synthetic = messages[2] as ToolMessage;
    expect(synthetic).toBeInstanceOf(ToolMessage);
    expect(synthetic.tool_call_id).toBe('c1');
    expect(synthetic.content).toBe(INTERRUPTED_CALL_TEXT);
  });

  it('leaves answered tool calls alone', () => {
    const state = {
      messages: [
        new AIMessage({
          content: '',
          tool_calls: [{ name: 'web_suche', args: {}, id: 'c1', type: 'tool_call' }] as never,
        }),
        new ToolMessage({ content: 'Treffer', tool_call_id: 'c1', name: 'web_suche' }),
      ],
    };

    expect(buildResumeInput(state, 'transient')?.messages).toHaveLength(2);
  });

  it('appends the wrap-up instruction on a recursion resume, after the repairs', () => {
    const state = {
      messages: [
        new AIMessage({
          content: '',
          tool_calls: [{ name: 'task', args: {}, id: 'c9', type: 'tool_call' }] as never,
        }),
      ],
    };

    const messages = buildResumeInput(state, 'recursion')?.messages as unknown[];

    expect((messages[1] as ToolMessage).tool_call_id).toBe('c9');
    const last = messages[2] as HumanMessage;
    expect(last).toBeInstanceOf(HumanMessage);
    expect(last.content).toBe(WRAP_UP_TEXT);
  });

  it('carries files and todos into the next attempt', () => {
    const state = {
      messages: [new HumanMessage('Frage')],
      files: { '/notizen.md': { content: 'Zwischenstand' } },
      todos: [{ content: 'Teilfrage 1', status: 'in_progress' }],
    };

    const input = buildResumeInput(state, 'transient');

    expect(input?.files).toEqual(state.files);
    expect(input?.todos).toEqual(state.todos);
  });

  it('omits files and todos when the state never had them', () => {
    const input = buildResumeInput({ messages: [new HumanMessage('Frage')] }, 'transient');

    expect(input).not.toHaveProperty('files');
    expect(input).not.toHaveProperty('todos');
  });
});
