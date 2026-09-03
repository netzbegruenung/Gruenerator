/**
 * Der `warning`-Zweig des Notebook-Adapters.
 *
 * `evidence_weak` ist keine Störung, sondern eine Aussage über GENAU DIESE
 * Antwort: er gehört unter den Text, nicht in einen Toast, der über der Seite
 * steht und zu keiner Nachricht gehört. Jeder andere Code toastet unverändert
 * weiter — das ist die Hälfte, die dieser Test mit festhält, sonst nimmt der
 * Sonderfall bei der nächsten Änderung die anderen Codes mit.
 *
 * Gefahren wird gegen einen echten SSE-Strom über den konfigurierten `fetch`,
 * nicht gegen eine Attrappe des Adapters: die Zeile, um die es geht, sitzt im
 * Parser-Schalter, und ein Test, der ihn umgeht, sichert nichts zu.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ChatModelRunResult } from '@assistant-ui/react';

const notifyWarning = vi.fn();
vi.mock('../lib/notify', () => ({
  notifyWarning: (...args: unknown[]) => notifyWarning(...args),
  notifyError: vi.fn(),
}));

const { createNotebookModelAdapter } = await import('./NotebookModelAdapter');
const { useChatConfigStore } = await import('../stores/chatConfigStore');
const { useAgentStore } = await import('../stores/chatStore');

const EVIDENCE_MESSAGE =
  'Zu dieser Frage habe ich im Notebook wenig Passendes gefunden — bitte die angegebenen Quellen prüfen.';

/** Baut eine Response, deren Body die gegebenen SSE-Frames liefert. */
function sseResponse(frames: Array<{ event: string; data: unknown }>): Response {
  const text = frames.map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`).join('');
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

/** Fährt den Adapter über den Strom und gibt das LETZTE Ergebnis zurück. */
async function runStream(frames: Array<{ event: string; data: unknown }>) {
  useChatConfigStore.setState({ fetch: async () => sseResponse(frames) });
  useAgentStore.setState({ selectedModel: 'gruenerator-ultra' });

  const adapter = createNotebookModelAdapter(() => ({ collectionId: 'berlin-system' }), {});

  // `ChatModelAdapter['run']` is declared as generator OR promise; ours is
  // always the generator (see interruptCallback.vitest.ts for the same cast).
  const stream = adapter.run({
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Wie backe ich Brot?' }] }],
  } as unknown as Parameters<typeof adapter.run>[0]) as AsyncGenerator<ChatModelRunResult, void>;

  let last: { metadata?: { custom?: Record<string, unknown> } } | undefined;
  for await (const result of stream) {
    last = result as { metadata?: { custom?: Record<string, unknown> } };
  }
  return last?.metadata?.custom ?? {};
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NotebookModelAdapter — warning', () => {
  it('schreibt evidence_weak nach custom.evidenceWeak statt in einen Toast', async () => {
    const custom = await runStream([
      { event: 'warning', data: { code: 'evidence_weak', message: EVIDENCE_MESSAGE } },
      { event: 'text_delta', data: { text: 'Dazu steht hier wenig.' } },
    ]);

    expect(custom.evidenceWeak).toBe(EVIDENCE_MESSAGE);
    expect(notifyWarning).not.toHaveBeenCalled();
  });

  it('toastet jeden anderen Code weiterhin', async () => {
    const custom = await runStream([
      {
        event: 'warning',
        data: { code: 'search_degraded', message: 'Einige Quellen waren nicht erreichbar.' },
      },
      { event: 'text_delta', data: { text: 'Antwort.' } },
    ]);

    expect(notifyWarning).toHaveBeenCalledWith('Einige Quellen waren nicht erreichbar.');
    expect(custom.evidenceWeak).toBeUndefined();
  });

  it('setzt das Feld nicht, wenn kein warning kam', async () => {
    const custom = await runStream([{ event: 'text_delta', data: { text: 'Antwort.' } }]);
    expect(custom.evidenceWeak).toBeUndefined();
  });
});
