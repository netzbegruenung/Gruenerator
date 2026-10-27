import { afterEach, describe, expect, it, vi } from 'vitest';

import { type PythonFile, useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';
import { usePythonFileStore } from '../stores/pythonFileStore';

import { getAvailableClientTools, getClientToolExecutor } from './clientTools';

afterEach(() => {
  useChatConfigStore.setState({ renderSharepicSheet: undefined });
});

describe('render_sharepic', () => {
  it('ist nur verfügbar, wenn der Host das Rendern der Karte eingehängt hat', () => {
    expect(getAvailableClientTools()).not.toContain('render_sharepic');
    expect(getClientToolExecutor('render_sharepic')).toBeNull();

    useChatConfigStore.setState({ renderSharepicSheet: async () => 'data:image/png;base64,AA' });

    expect(getAvailableClientTools()).toContain('render_sharepic');
    expect(getClientToolExecutor('render_sharepic')).not.toBeNull();
  });

  it('rendert die initialProps und liefert das Bild', async () => {
    const render = vi.fn(async () => 'data:image/jpeg;base64,BB');
    useChatConfigStore.setState({ renderSharepicSheet: render });

    const result = await getClientToolExecutor('render_sharepic')!({
      variantId: 'v1',
      canvasType: 'freeform',
      initialProps: { creatorSpec: {} },
    });

    expect(render).toHaveBeenCalledWith({ creatorSpec: {} });
    expect(result).toEqual({ image: 'data:image/jpeg;base64,BB' });
  });

  it('ein Renderfehler oder fehlende Props ergeben kein Bild statt einer Ausnahme', async () => {
    useChatConfigStore.setState({
      renderSharepicSheet: async () => {
        throw new Error('Konva kaputt');
      },
    });
    const execute = getClientToolExecutor('render_sharepic')!;

    expect(await execute({ initialProps: {} })).toEqual({ image: null });
    expect(await execute({})).toEqual({ image: null });
  });
});

/**
 * Der Pyodide-Speicher ist leer, wenn `tabelle_auswerten` im ersten Zug eines
 * neuen Threads rechnet: der Wechsel vom Entwurf auf den frischen Thread leert
 * ihn, und die Rückholung (`ThreadDataSyncEffect`) lief in diesem Moment schon
 * — bevor der Server die Tabelle gespeichert hatte. Live 27.10.2026:
 * `NameError: name 'df' is not defined`. Der Server speichert die Anhänge jetzt
 * beim Pausieren; der Executor holt sie sich, wenn sein Speicher leer ist.
 */
describe('run_python', () => {
  const THREAD = 'e4d1c0aa-0000-4000-8000-000000009009';
  const originalFetch = useChatConfigStore.getState().fetch;

  afterEach(() => {
    useChatConfigStore.setState({ runPython: undefined, fetch: originalFetch });
    useAgentStore.setState({ currentThreadId: null });
    usePythonFileStore.getState().clear();
  });

  function stubRun() {
    const run = vi.fn(async (_code: string, _files?: PythonFile[]) => ({
      ok: true,
      stdout: '{"ergebnis": 1}',
      error: null,
      figures: [],
      files: [],
    }));
    useChatConfigStore.setState({ runPython: run as never });
    return run;
  }

  it('holt die Tabellen des Threads, wenn der Speicher leer ist', async () => {
    const run = stubRun();
    useAgentStore.setState({ currentThreadId: THREAD });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            files: [{ name: 'test.xlsx', mimeType: 'application/x', data: btoa('abc') }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    useChatConfigStore.setState({ fetch: fetchMock as never });

    await getClientToolExecutor('run_python')!({ code: 'print(df)' }, { threadId: THREAD });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/chat-service/threads/${THREAD}/tabular-files`,
      expect.anything()
    );
    const files = run.mock.calls[0]![1]!;
    expect(files.map((f) => f.name)).toEqual(['test.xlsx']);
    expect(new TextDecoder().decode(files[0]!.bytes)).toBe('abc');
    // …und behält sie für die nächste Rechnung im selben Thread.
    expect(usePythonFileStore.getState().files.map((f) => f.name)).toEqual(['test.xlsx']);
  });

  it('fragt den Server nicht, wenn die Tabelle schon da ist', async () => {
    const run = stubRun();
    const fetchMock = vi.fn();
    useChatConfigStore.setState({ fetch: fetchMock as never });
    usePythonFileStore
      .getState()
      .setFile({ name: 'a.csv', mimeType: 'text/csv', bytes: new ArrayBuffer(1) });

    await getClientToolExecutor('run_python')!({ code: 'print(df)' }, { threadId: THREAD });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(run.mock.calls[0]![1]!.map((f) => f.name)).toEqual(['a.csv']);
  });

  it('rechnet trotzdem, wenn die Rückholung scheitert', async () => {
    const run = stubRun();
    useChatConfigStore.setState({
      fetch: vi.fn(async () => {
        throw new Error('offline');
      }) as never,
    });

    await getClientToolExecutor('run_python')!({ code: 'print(1)' }, { threadId: THREAD });

    expect(run).toHaveBeenCalledWith('print(1)', []);
  });
});
