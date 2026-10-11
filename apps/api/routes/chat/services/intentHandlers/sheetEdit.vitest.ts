import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

const mocks = vi.hoisted(() => ({
  planAndQueueSheetEdit: vi.fn<(...a: unknown[]) => unknown>(),
  rememberArtifact: vi.fn<(...a: unknown[]) => unknown>(),
  finishEditTurn: vi.fn<(...a: unknown[]) => unknown>(),
}));

vi.mock('../sheetEditCore.js', () => ({
  planAndQueueSheetEdit: (...a: unknown[]) => mocks.planAndQueueSheetEdit(...a),
  queuedSheetEditText: (o: { title: string }) => `eingetragen: ${o.title}`,
}));
vi.mock('../createTurnHelpers.js', () => ({
  rememberArtifact: (...a: unknown[]) => mocks.rememberArtifact(...a),
  streamTextInChunks: (sse: { send: (t: string, p: unknown) => void }, text: string) =>
    sse.send('text_delta', { text }),
}));
vi.mock('../editTurnCompletion.js', () => ({
  finishEditTurn: (...a: unknown[]) => mocks.finishEditTurn(...a),
}));

const { handleSheetEdit } = await import('./sheetEdit.js');

function setup(sheetEditId: string | null = 's1', threadId: string | undefined = 't1') {
  const send = vi.fn();
  const call = () =>
    handleSheetEdit({
      sse: { send } as never,
      classifiedState: {
        sheetEditId,
        startTime: 1,
        classificationTimeMs: 2,
      } as unknown as ChatGraphState,
      actualThreadId: threadId,
      userId: 'u1',
      userContent: 'mach fett',
    });
  const texts = () =>
    send.mock.calls
      .filter((c) => c[0] === 'text_delta')
      .map((c) => (c[1] as { text: string }).text);
  return { send, call, texts };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe('handleSheetEdit', () => {
  it('fails honestly without a sheetEditId', async () => {
    const { call, texts } = setup(null);
    expect(await call()).toBe(true);
    expect(texts()[0]).toContain('nicht zuordnen');
    expect(mocks.planAndQueueSheetEdit).not.toHaveBeenCalled();
    expect(mocks.finishEditTurn).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'edit_sheet', streamed: true })
    );
  });

  it('streams the queued text and remembers the artifact', async () => {
    mocks.planAndQueueSheetEdit.mockResolvedValue({
      status: 'queued',
      title: 'Budget',
      summary: 's',
      live: true,
      operationCount: 1,
    });
    const { call, texts } = setup();
    await call();
    expect(texts().join('')).toBe('eingetragen: Budget');
    expect(mocks.planAndQueueSheetEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        sheetId: 's1',
        instruction: 'mach fett',
        destructiveAllowed: false,
      })
    );
    expect(mocks.rememberArtifact).toHaveBeenCalledWith('t1', 'sheet', 's1', 'Budget');
    expect(mocks.finishEditTurn).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'eingetragen: Budget', threadId: 't1' })
    );
  });

  it('asks for confirmation on destructive plans', async () => {
    mocks.planAndQueueSheetEdit.mockResolvedValue({
      status: 'needs_confirmation',
      title: 'Budget',
      summary: '1× delete_columns',
    });
    const { call, texts } = setup();
    await call();
    expect(texts().join('')).toContain('Soll ich das so machen?');
  });

  it('relays the failure message and does not remember', async () => {
    mocks.planAndQueueSheetEdit.mockResolvedValue({ status: 'failed', message: 'keine Rechte' });
    const { call, texts } = setup();
    await call();
    expect(texts()).toEqual(['keine Rechte']);
    expect(mocks.rememberArtifact).not.toHaveBeenCalled();
  });
});
