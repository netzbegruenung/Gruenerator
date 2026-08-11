import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { GraphRecursionError } from '@langchain/langgraph';
import { describe, expect, it } from 'vitest';

import {
  DEADLINE_TEXT,
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

  /**
   * The research clock is a budget, not a failure: the material is gathered and
   * only the writing is missing, so it earns the same wrap-up leg the recursion
   * limit gets. The caller's signal remains the one thing that ends a run — and
   * when both have fired it wins, because then nothing is left to write with.
   */
  it('treats its own research deadline as resumable, not as fatal', () => {
    const deadline = new AbortController();
    deadline.abort();

    expect(classifyRunError(namedError('TimeoutError'), undefined, deadline.signal)).toBe(
      'deadline'
    );
  });

  it('lets the caller signal win over the research deadline', () => {
    const caller = new AbortController();
    const deadline = new AbortController();
    caller.abort();
    deadline.abort();

    expect(classifyRunError(namedError('TimeoutError'), caller.signal, deadline.signal)).toBe(
      'fatal'
    );
  });

  it('recognises the recursion limit as its own kind', () => {
    expect(
      classifyRunError(namedError('GraphRecursionError', 'Recursion limit of 60 reached'))
    ).toBe('recursion');
  });

  it('recognises the real library class, not just the name we assume it carries', () => {
    expect(classifyRunError(new GraphRecursionError('Recursion limit of 60 reached'))).toBe(
      'recursion'
    );
  });

  it('sees through a wrapper — a re-thrown recursion error still gets the wrap-up leg', () => {
    const wrapped = new Error('Stream failed', {
      cause: new GraphRecursionError('Recursion limit of 60 reached'),
    });

    expect(classifyRunError(wrapped)).toBe('recursion');
  });

  it('survives a cause chain that points back at itself', () => {
    const loop = new Error('a') as Error & { cause?: unknown };
    loop.cause = loop;

    expect(classifyRunError(loop)).toBe('transient');
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

  it('tells a deadline resume to stop researching and write, and to mark the gaps', () => {
    const state = { messages: [new HumanMessage('Frage')] };

    const messages = buildResumeInput(state, 'deadline')?.messages as unknown[];

    const last = messages[messages.length - 1] as HumanMessage;
    expect(last.content).toBe(DEADLINE_TEXT);
    expect(last.content).toContain('write_file');
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
