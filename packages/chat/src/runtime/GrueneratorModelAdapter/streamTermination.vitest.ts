import { describe, it, expect, vi } from 'vitest';

import { parseSSEStream } from './parseSSEStream';

import type { GrueneratorAdapterCallbacks } from './types';

/**
 * Terminal invariant: a stream that ends without the backend's terminal event
 * is a FAILURE, not a short answer. Before this, such a stream yielded a normal
 * result and the truncated reply was indistinguishable from a complete one —
 * the client-side half of the silent-swallow bug class.
 */

function sseBody(events: Array<{ event: string; data: unknown }>): string {
  return events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
}

const callbacks: GrueneratorAdapterCallbacks = {};

async function drain(body: string) {
  const outcome = {
    interrupted: false,
    indexedDocumentIds: [] as string[],
    completed: undefined as boolean | undefined,
  };
  const results = [];
  for await (const result of parseSSEStream(new Response(body), callbacks, outcome)) {
    results.push(result);
  }
  return { outcome, results };
}

describe('stream termination detection', () => {
  it('marks a stream that ended with `done` as completed', async () => {
    const { outcome } = await drain(
      sseBody([
        { event: 'text_delta', data: { text: 'Hallo' } },
        { event: 'done', data: { citations: [] } },
      ])
    );

    expect(outcome.completed).toBe(true);
  });

  it('marks a stream that ended with `completion` as completed', async () => {
    const { outcome } = await drain(
      sseBody([
        { event: 'text_delta', data: { text: 'Hallo' } },
        { event: 'completion', data: { text: 'Hallo' } },
      ])
    );

    expect(outcome.completed).toBe(true);
  });

  it('marks a stream that just closed as NOT completed', async () => {
    const { outcome, results } = await drain(
      sseBody([{ event: 'text_delta', data: { text: 'Halbe Antw' } }])
    );

    expect(outcome.completed).toBe(false);
    // The partial text is still yielded — it is worth reading, it just must
    // not be presented as finished (the adapter adds the failure status).
    expect(results.length).toBeGreaterThan(0);
  });

  it('does not flag an interrupt-terminated stream as incomplete', async () => {
    const { outcome } = await drain(
      sseBody([
        { event: 'text_delta', data: { text: 'Welche Datei?' } },
        {
          event: 'interrupt',
          data: { interruptType: 'clarification', question: 'Welche Datei?' },
        },
      ])
    );

    expect(outcome.completed).toBe(true);
    expect(outcome.interrupted).toBe(true);
  });
});

describe('events after `done`', () => {
  it('still processes a warning emitted after the terminal event', async () => {
    // The backend awaits persistence AFTER sending `done` and emits
    // `persist_failed` there — that only reaches the user if the parser keeps
    // reading until the stream closes. This test pins that contract.
    const warned: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warned.push(args.map(String).join(' '));
    });

    try {
      await drain(
        sseBody([
          { event: 'text_delta', data: { text: 'Antwort' } },
          { event: 'done', data: { citations: [] } },
          {
            event: 'warning',
            data: { code: 'persist_failed', message: 'Nicht gespeichert.' },
          },
        ])
      );
    } finally {
      spy.mockRestore();
    }

    expect(warned.join('\n')).toContain('persist_failed');
  });
});

describe('error event handling', () => {
  it('throws on a well-formed error event', async () => {
    await expect(
      drain(sseBody([{ event: 'error', data: { error: 'Kaputt', code: 'internal' } }]))
    ).rejects.toThrow('Kaputt');
  });

  it('still throws when the error payload fails the schema gate', async () => {
    // Schema drift on the fatal event must never be silently dropped — that
    // would swallow the very failure the event exists to report.
    await expect(
      drain(sseBody([{ event: 'error', data: { error: 42, unexpected: true } }]))
    ).rejects.toThrow();
  });

  it('salvages a usable message from a malformed error payload', async () => {
    await expect(
      drain(sseBody([{ event: 'error', data: { error: 'Anbieter down', extra: { a: 1 } } }]))
    ).rejects.toThrow('Anbieter down');
  });
});
