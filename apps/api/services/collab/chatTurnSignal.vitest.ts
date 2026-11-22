/**
 * `signalTeamChatTurn` runs after a turn step is persisted and is called with
 * `void`: it must only signal chats shared to a project, and never reject.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const internalMock = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: queryMock }),
}));
vi.mock('./hocuspocusInternal.js', () => ({
  hocuspocusInternal: (...args: unknown[]) => internalMock(...args),
}));

const { signalTeamChatTurn } = await import('./chatTurnSignal.js');

beforeEach(() => {
  queryMock.mockReset();
  internalMock.mockReset().mockResolvedValue({ ok: true });
  vi.stubEnv('HOCUSPOCUS_INTERNAL_TOKEN', 'secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('signalTeamChatTurn', () => {
  it('posts the signal for a thread shared to a project', async () => {
    queryMock.mockResolvedValue([{ '?column?': 1 }]);

    await signalTeamChatTurn('t1', 'started', 'u1');

    expect(queryMock.mock.calls[0]![0]).toContain('deleted_at IS NULL');
    expect(internalMock).toHaveBeenCalledWith('POST', '/internal/chat/t1/turn-signal', {
      kind: 'started',
      by: 'u1',
    });
  });

  it('stays silent for a private chat', async () => {
    queryMock.mockResolvedValue([]);
    await signalTeamChatTurn('t1', 'message', 'u1');
    expect(internalMock).not.toHaveBeenCalled();
  });

  it('does nothing without the internal token', async () => {
    vi.stubEnv('HOCUSPOCUS_INTERNAL_TOKEN', '');
    await signalTeamChatTurn('t1', 'message', null);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('never rejects when Hocuspocus or the lookup fails', async () => {
    queryMock.mockResolvedValue([{}]);
    internalMock.mockRejectedValue(new Error('down'));
    await expect(signalTeamChatTurn('t1', 'message', null)).resolves.toBeUndefined();
    queryMock.mockRejectedValue(new Error('db'));
    await expect(signalTeamChatTurn('t1', 'message', null)).resolves.toBeUndefined();
  });
});
