import { describe, expect, it, jest } from '@jest/globals';

// The package is ESM-only; the poll only needs `fromArray`'s shape.
jest.mock('@assistant-ui/react-native', () => ({
  ExportedMessageRepository: {
    fromArray: (messages: { id: string }[]) => ({
      headId: null,
      messages: messages.map((message) => ({ message, parentId: null })),
    }),
  },
}));

import { applyTeamChatRows, rowsSignature, type TeamSyncRow } from './teamChatSync';

const row = (id: string, role = 'user', content: unknown = id): TeamSyncRow => ({
  id,
  role,
  content,
});
const convert = (rows: TeamSyncRow[]) =>
  rows.map((r) => ({ id: r.id, role: r.role as 'user', content: String(r.content) }));
const thread = (isRunning = false) => ({
  getState: () => ({ isRunning }),
  import: jest.fn(),
});

describe('applyTeamChatRows', () => {
  it('imports the canonical rows once, then stays quiet while nothing changes', () => {
    const t = thread();
    const rows = [row('a'), row('b', 'assistant')];
    const first = applyTeamChatRows({ rows, thread: t, lastSignature: null, convert });
    const second = applyTeamChatRows({ rows, thread: t, lastSignature: first, convert });
    expect(t.import).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('replaces instead of appending, so a peer message never shows twice', () => {
    const t = thread();
    const first = applyTeamChatRows({ rows: [row('a')], thread: t, lastSignature: null, convert });
    applyTeamChatRows({ rows: [row('a'), row('b')], thread: t, lastSignature: first, convert });
    const repo = t.import.mock.calls[1]?.[0] as { messages: { message: { id: string } }[] };
    expect(repo.messages.map((m) => m.message.id)).toEqual(['a', 'b']);
  });

  it('does not touch the thread while this device is streaming', () => {
    const t = thread(true);
    const sig = applyTeamChatRows({ rows: [row('a')], thread: t, lastSignature: null, convert });
    expect(t.import).not.toHaveBeenCalled();
    expect(sig).toBeNull();
  });

  it('holds back a peer answer that is still streaming', () => {
    const t = thread();
    const live = { ...row('b', 'assistant'), metadata: { live: true } };
    applyTeamChatRows({ rows: [row('a'), live], thread: t, lastSignature: null, convert });
    const repo = t.import.mock.calls[0]?.[0] as { messages: unknown[] };
    expect(repo.messages).toHaveLength(1);
  });

  it('notices a row that kept its id but grew', () => {
    expect(rowsSignature([row('a', 'assistant', 'x')])).not.toBe(
      rowsSignature([row('a', 'assistant', 'xyz')])
    );
  });
});
