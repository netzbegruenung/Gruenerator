import { describe, expect, it } from 'vitest';

import { confirmedArgs, confirmGate } from './confirmGate.js';

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

describe('confirmGate — Rückfrage für den Schreiber', () => {
  it('merkt die Rückfrage im Zustand vor', () => {
    const state = { messages: [{ role: 'user', content: 'Kürz das' }] } as never as {
      chatArtifactQuestions?: string[];
    };
    confirmGate({
      state: state as never,
      threadId: 't1',
      confirm: false,
      question: 'Soll das so?',
    });
    expect(state.chatArtifactQuestions).toEqual(['Soll das so?']);
  });
});

describe('confirmedArgs', () => {
  const state = {
    lastTurnPendingEdit: {
      toolName: 'edit_document_text',
      args: { ersetzungen: [{ alt: 'A', neu: 'B' }], confirm: false },
    },
  } as never;

  it('takes the args the person agreed to when confirming', () => {
    const out = confirmedArgs(state, 'edit_document_text', true, {
      ersetzungen: [{ alt: 'alt, erfunden', neu: 'x' }],
      confirm: true,
    });
    expect(out).toEqual({ ersetzungen: [{ alt: 'A', neu: 'B' }], confirm: true });
  });

  it('keeps the model args for a first call or another tool', () => {
    const args = { ersetzungen: [{ alt: 'C', neu: 'D' }], confirm: false };
    expect(confirmedArgs(state, 'edit_document_text', false, args)).toBe(args);
    expect(
      confirmedArgs(state, 'edit_sheet', true, { ...args, confirm: true }).ersetzungen
    ).toEqual([{ alt: 'C', neu: 'D' }]);
  });
});
