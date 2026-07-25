/**
 * The sticky pointer a follow-up turn is classified against.
 *
 * Single-pass handlers persist via createMessage directly and never reach
 * persistAssistantResponse's deriveToolContext, so they have to write it
 * themselves — otherwise a create_sheet turn left the pointer on whatever the
 * PREVIOUS turn produced and the next "kürze das" edited the wrong artifact.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const setThreadToolContext = vi.fn();

vi.mock('./threadPersistenceService.js', () => ({ setThreadToolContext }));

const { failCreation, rememberArtifact } = await import('./createTurnHelpers.js');

beforeEach(() => {
  setThreadToolContext.mockReset().mockResolvedValue(undefined);
});

describe('rememberArtifact', () => {
  it('writes kind, ref and label for the thread', async () => {
    await rememberArtifact('thread-1', 'sheet', 'doc-42', 'Prognosen 2026');

    expect(setThreadToolContext).toHaveBeenCalledWith('thread-1', {
      kind: 'sheet',
      ref: 'doc-42',
      label: 'Prognosen 2026',
    });
  });

  it('is a no-op without a thread (a one-off turn has nothing to remember)', async () => {
    await rememberArtifact(undefined, 'sheet', 'doc-42', 'Titel');

    expect(setThreadToolContext).not.toHaveBeenCalled();
  });

  it('swallows a persistence failure — the artifact itself already succeeded', async () => {
    setThreadToolContext.mockRejectedValueOnce(new Error('postgres down'));

    await expect(rememberArtifact('thread-1', 'pdf', 'a.pdf', 'Titel')).resolves.toBeUndefined();
  });

  it('resolves before returning, so the next turn cannot read a stale pointer', async () => {
    let written = false;
    setThreadToolContext.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            written = true;
            resolve();
          }, 5)
        )
    );

    await rememberArtifact('thread-1', 'board', 'board-1', 'Kampagne');

    expect(written).toBe(true);
  });
});

describe('failCreation', () => {
  function makeSse() {
    const events: Array<{ event: string; data: unknown }> = [];
    return {
      events,
      sse: {
        send: (event: string, data: unknown) => void events.push({ event, data }),
        sendRaw: (event: string, data: unknown) => void events.push({ event, data }),
        end: () => void events.push({ event: 'end', data: null }),
      } as never,
    };
  }

  it('streams the message, terminates the turn and claims ownership', () => {
    const { sse, events } = makeSse();

    expect(failCreation(sse, 'thread-1', 'create_pdf', 'Ging nicht.')).toBe(true);
    expect(events.map((e) => e.event)).toEqual(['text_delta', 'done', 'end']);
  });

  it('tags the done event with the intent so the client can attribute it', () => {
    const { sse, events } = makeSse();
    failCreation(sse, 'thread-1', 'create_pdf', 'Ging nicht.');

    const done = events.find((e) => e.event === 'done')?.data as {
      threadId: string;
      metadata: { intent: string };
    };
    expect(done.metadata.intent).toBe('create_pdf');
    expect(done.threadId).toBe('thread-1');
  });

  it('passes the caller text through verbatim (templated at the call site)', () => {
    const { sse, events } = makeSse();
    failCreation(sse, undefined, 'create_sheet', 'Die Tabelle konnte nicht erstellt werden.');

    expect((events[0]?.data as { text: string }).text).toBe(
      'Die Tabelle konnte nicht erstellt werden.'
    );
  });
});
