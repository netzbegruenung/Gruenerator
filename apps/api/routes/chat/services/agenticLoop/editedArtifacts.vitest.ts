import { describe, expect, it } from 'vitest';

import { editedArtifactKinds, guardedArtifactKinds } from './editedArtifacts.js';

import type { PersistedStep } from './types.js';
import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

const step = (toolName: string, over: Partial<PersistedStep> = {}): PersistedStep => ({
  toolCallId: toolName,
  toolName,
  args: {},
  result: { ok: true },
  ...over,
});

describe('editedArtifactKinds', () => {
  it('counts successful writes per kind', () => {
    const kinds = editedArtifactKinds(
      [step('edit_sheet'), step('edit_presentation'), step('edit_sharepic')],
      {}
    );
    expect([...kinds].sort()).toEqual(['presentation', 'sharepic', 'sheet']);
  });

  it('does not count failures, confirm questions or reads', () => {
    const kinds = editedArtifactKinds(
      [
        step('edit_sheet', { ok: false }),
        step('edit_presentation', { result: { needsConfirmation: true, note: '?' } }),
        step('read_sheet'),
        step('boards_tasks', { args: { action: 'add_card' } }),
      ],
      {}
    );
    expect(kinds.size).toBe(0);
  });

  it('maps board writes and edit_document by surface', () => {
    expect([
      ...editedArtifactKinds([step('boards_tasks', { args: { action: 'move_card' } })], {}),
    ]).toEqual(['board']);
    expect([...editedArtifactKinds([step('edit_document')], { editToolSurface: 'sheet' })]).toEqual(
      ['sheet']
    );
  });
});

describe('guardedArtifactKinds', () => {
  it('always guards sharepics, others only when the thread has them', () => {
    expect([...guardedArtifactKinds({})]).toEqual(['sharepic']);
    const state = {
      threadArtifacts: [{ kind: 'sheet' }, { kind: 'pdf' }],
      editToolSurface: 'presentation',
    } as unknown as ChatGraphState;
    expect([...guardedArtifactKinds(state)].sort()).toEqual(['presentation', 'sharepic', 'sheet']);
  });
});
