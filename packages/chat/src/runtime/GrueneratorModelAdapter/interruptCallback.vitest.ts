/**
 * `onInterrupt` is the only interrupt signal that reaches every surface.
 *
 * The adapter arms `interruptedThreadId` when a turn ends on a clarification
 * and from then on aborts every run on that thread. A message queue on top of
 * that would append the next turn and have it aborted — stranded (#3020). The
 * callback fires from the same statement that arms the refusal, so a queue
 * guard listening to it is always ahead of the turn it has to save.
 *
 * The runtime's own `requires-action` cannot do this job: it is set only for
 * tools named in `unstable_humanToolNames`, which the main chat declares and
 * the editor sidebar does not. These tests therefore drive the adapter, not the
 * message status.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../../stores/chatConfigStore';

import { createGrueneratorModelAdapter } from './index';

import type { GrueneratorAdapterConfig } from './types';
import type { ChatModelRunOptions } from '@assistant-ui/react';

const THREAD_ID = 'e4d1c0aa-0000-4000-8000-000000000042';

function sseBody(events: Array<{ event: string; data: unknown }>): string {
  return events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
}

function respondWith(events: Array<{ event: string; data: unknown }>) {
  const fetchMock = vi.fn(async () => new Response(sseBody(events), { status: 200 }));
  useChatConfigStore.setState({ fetch: fetchMock as unknown as typeof fetch });
  return fetchMock;
}

const config: GrueneratorAdapterConfig = {
  agentId: null,
  modelId: 'mistral-medium-2604',
  enabledTools: {} as GrueneratorAdapterConfig['enabledTools'],
  threadId: THREAD_ID,
};

async function runTurn(onInterrupt: () => void) {
  const adapter = createGrueneratorModelAdapter(() => config, { onInterrupt });
  const options = {
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Erstell ein Sharepic' }] }],
    abortSignal: new AbortController().signal,
  } as unknown as ChatModelRunOptions;

  for await (const _ of adapter.run(options)) {
    // Drain: the adapter yields partial results, the assertion is on the callback.
  }
}

describe('adapter interrupt callback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fires when the turn ends on a clarification', async () => {
    respondWith([
      { event: 'interrupt', data: { interruptType: 'clarification', question: 'Welches Format?' } },
      { event: 'done', data: { citations: [] } },
    ]);
    const onInterrupt = vi.fn();

    await runTurn(onInterrupt);

    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('stays silent for an ordinary finished turn', async () => {
    respondWith([
      { event: 'text_delta', data: { text: 'Fertig' } },
      { event: 'done', data: { citations: [] } },
    ]);
    const onInterrupt = vi.fn();

    await runTurn(onInterrupt);

    expect(onInterrupt).not.toHaveBeenCalled();
  });

  it('fires in lockstep with the refusal it announces', async () => {
    // The point of the callback: whoever hears it knows the NEXT run on this
    // thread is dead on arrival. Without a listener the queue would send into
    // exactly this abort.
    respondWith([
      { event: 'interrupt', data: { interruptType: 'clarification', question: 'Welches Format?' } },
      { event: 'done', data: { citations: [] } },
    ]);
    const onInterrupt = vi.fn();
    const adapter = createGrueneratorModelAdapter(() => config, { onInterrupt });
    const options = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Erstell ein Sharepic' }] }],
      abortSignal: new AbortController().signal,
    } as unknown as ChatModelRunOptions;

    for await (const _ of adapter.run(options)) {
      /* first turn */
    }
    expect(onInterrupt).toHaveBeenCalledTimes(1);

    await expect(async () => {
      for await (const _ of adapter.run(options)) {
        /* the turn a queue would have sent */
      }
    }).rejects.toThrow(/abort/i);
  });
});
