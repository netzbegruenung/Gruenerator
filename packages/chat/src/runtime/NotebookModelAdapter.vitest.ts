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
import { type ChatModelRunResult } from '@assistant-ui/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const notifyWarning = vi.fn<(...args: unknown[]) => void>();
vi.mock('../lib/notify', () => ({
  notifyWarning: (...args: unknown[]) => {
    notifyWarning(...args);
  },
  notifyError: vi.fn(),
}));

const { createNotebookModelAdapter } = await import('./NotebookModelAdapter');
const { useChatConfigStore } = await import('../stores/chatConfigStore');
const { useAgentStore } = await import('../stores/chatStore');

const EVIDENCE_MESSAGE =
  'Zu dieser Frage habe ich im Notebook wenig Passendes gefunden — bitte die angegebenen Quellen prüfen.';

type Frame = { event: string; data: unknown };

const encodeFrames = (frames: Frame[]) =>
  frames.map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`).join('');

/**
 * Baut eine Response, deren Body die gegebenen SSE-Frames liefert — als EIN
 * Chunk, oder (bei mehreren Gruppen) als getrennte Reads mit Pause dazwischen,
 * damit der 50-ms-Yield-Takt des Adapters zwischen den Chunks wirklich greift.
 */
function sseResponse(chunks: Frame[][], gapMs = 0): Response {
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const [i, frames] of chunks.entries()) {
        if (i > 0 && gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
        controller.enqueue(new TextEncoder().encode(encodeFrames(frames)));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

/** Fährt den Adapter über den Strom und gibt ALLE Ergebnisse zurück. */
async function collectStream(chunks: Frame[][], gapMs = 0): Promise<ChatModelRunResult[]> {
  useChatConfigStore.setState({ fetch: async () => sseResponse(chunks, gapMs) });
  useAgentStore.setState({ selectedModel: 'gruenerator-ultra' });

  const adapter = createNotebookModelAdapter(() => ({ collectionId: 'berlin-system' }), {});

  // `ChatModelAdapter['run']` is declared as generator OR promise; ours is
  // always the generator (see interruptCallback.vitest.ts for the same cast).
  const stream = adapter.run({
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Wie backe ich Brot?' }] }],
  } as unknown as Parameters<typeof adapter.run>[0]) as AsyncGenerator<ChatModelRunResult, void>;

  const results: ChatModelRunResult[] = [];
  for await (const result of stream) results.push(result);
  return results;
}

/** Fährt den Adapter über den Strom und gibt das LETZTE Ergebnis zurück. */
async function runStream(frames: Frame[]) {
  const results = await collectStream([frames]);
  const last = results.at(-1) as { metadata?: { custom?: Record<string, unknown> } } | undefined;
  return last?.metadata?.custom ?? {};
}

const textOf = (r: ChatModelRunResult): string | undefined =>
  r.content?.find((p): p is { type: 'text'; text: string } => p.type === 'text')?.text;

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Zitatmarker und `useSmooth`. Die Enthüllung von assistant-ui animiert nur,
 * solange jeder neue Text den angezeigten VERLÄNGERT; sonst setzt sie auf ""
 * zurück und tippt alles neu. Der Adapter darf den Live-Text deshalb nicht
 * umschreiben (`[cite:3` → `[3]` ist keine Verlängerung) — das macht der
 * Renderer auf dem Syntaxbaum. Erst der Abschluss normalisiert, und weil er
 * den Text ohnehin gegen die neu nummerierte Backend-Antwort tauscht, trägt
 * er `status: complete` im SELBEN Yield: bei „nicht running" snappt useSmooth
 * auf den Volltext, statt ihn zu wiederholen.
 */
describe('NotebookModelAdapter — Zitatmarker im Strom', () => {
  it('reicht [cite:N] im Live-Text roh durch, sodass jeder Yield den vorigen verlängert', async () => {
    const results = await collectStream(
      [
        [{ event: 'text_delta', data: { text: 'Fakt [cite:1' } }],
        [{ event: 'text_delta', data: { text: '] hier.' } }],
      ],
      60
    );
    // Live = noch ohne Status; der Abschluss-Yield darf (und muss) abweichen.
    const live = results.filter((r) => !r.status).map(textOf);
    const last = results.at(-1)!;

    expect(live).toContain('Fakt [cite:1] hier.');
    for (let i = 1; i < live.length; i++) {
      expect(live[i]!.startsWith(live[i - 1]!)).toBe(true);
    }
    expect(last.status).toEqual({ type: 'complete', reason: 'stop' });
    expect(textOf(last)).toBe('Fakt [1] hier.');
  });

  it('normalisiert erst im Abschluss-Yield und markiert ihn dort als complete', async () => {
    const results = await collectStream(
      [
        [{ event: 'text_delta', data: { text: 'Fakt [cite:23].' } }],
        [
          {
            event: 'completion',
            data: {
              type: 'completion',
              answer: 'Fakt [cite:1].',
              citations: [],
              sources: [],
              allSources: [],
            },
          },
        ],
      ],
      60
    );
    const last = results.at(-1)!;

    expect(textOf(last)).toBe('Fakt [1].');
    expect(last.status).toEqual({ type: 'complete', reason: 'stop' });
  });
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
