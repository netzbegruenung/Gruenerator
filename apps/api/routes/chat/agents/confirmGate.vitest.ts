import { describe, expect, it } from 'vitest';

import { confirmGate } from './confirmGate.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const stateWith = (...users: string[]) =>
  ({
    messages: users.flatMap((t) => [
      { role: 'user', content: t },
      { role: 'assistant', content: 'ok' },
    ]),
  }) as unknown as ChatGraphState;

const gate = (state: ChatGraphState, over: Partial<Parameters<typeof confirmGate>[0]> = {}) =>
  confirmGate({ state, threadId: 't1', confirm: true, question: 'Wirklich löschen?', ...over });

describe('confirmGate', () => {
  it('refuses without a thread', () => {
    expect(gate(stateWith('ja'), { threadId: null })).toEqual({
      error: expect.stringContaining('nicht möglich'),
    });
  });

  it('asks back on the first call (confirm=false)', () => {
    const out = gate(stateWith('ja'), { confirm: false });
    expect(out).toMatchObject({ needsConfirmation: true });
    const note = (out as { note: string }).note;
    expect(note).toContain('Wirklich löschen?');
    expect(note).toContain('confirm=true');
  });

  it('lets a short agreement through', () => {
    expect(gate(stateWith('Lösch das mal vielleicht später', 'ja'))).toBeNull();
  });

  it('lets an explicit delete ask in the last two turns through', () => {
    expect(gate(stateWith('Lösch Spalte C', 'Und dann?'))).toBeNull();
  });

  it('rejects confirm=true without agreement', () => {
    const out = gate(stateWith('Mach es abends mit warmem Licht'));
    expect(out).toEqual({ error: expect.stringContaining('nicht zugestimmt') });
  });

  it('ignores a delete ask older than the last two user turns', () => {
    const out = gate(stateWith('Lösch Spalte C', 'Danke', 'Mach es bunter'));
    expect(out).toMatchObject({ error: expect.any(String) });
  });
});
