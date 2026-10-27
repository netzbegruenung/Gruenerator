/**
 * `tabelle_auswerten`: Codegen beim Halten, Ergebnis des Browsers als
 * Werkzeugergebnis — Fehler eingeschlossen, damit das Modell korrigieren kann.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { codegenMock, persistMock, threadAttachmentsMock } = vi.hoisted(() => ({
  codegenMock: vi.fn(),
  persistMock: vi.fn(),
  threadAttachmentsMock: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock('../../../agents/langgraph/ChatGraph/nodes/pandasComputeNode.js', () => ({
  pandasComputeNode: codegenMock,
}));
vi.mock('../services/computeAssetStorage.js', () => ({ persistComputeAssets: persistMock }));
vi.mock('../services/attachmentPersistenceService.js', () => ({
  getThreadAttachments: threadAttachmentsMock,
}));

import {
  clientCanUseTabularToolFrom,
  isTabelleAuswertenMountable,
  makeTabelleAuswertenTool,
  tabelleAuswertenClientTool,
  TABELLE_AUSWERTEN_TOOL,
} from './tabelleAuswertenTool.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { PersistedStep } from '../services/agenticLoop/types.js';
import type { StoredLoopClientToolState } from '../services/loopClientToolStateStore.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const state = {
  messages: [{ role: 'user', content: 'Wie viel Umsatz im März?' }],
} as unknown as ChatGraphState;

/**
 * Ältere Web-Bundles und ausgelieferte Desktop-Builds melden `run_python`, können
 * aber nach „Einmal erlauben" keinen Client-Tool-Lauf fortsetzen. Erst die
 * Fähigkeit `tabelle_auswerten` in `clientTools` montiert das Werkzeug.
 */
describe('tabelle_auswerten: Client-Fähigkeit', () => {
  it('alter Client mit nur run_python ⇒ keine Fähigkeit', () => {
    expect(clientCanUseTabularToolFrom(['run_python'])).toBe(false);
    expect(clientCanUseTabularToolFrom(['run_python', 'render_sharepic'])).toBe(false);
  });

  it('neuer Client mit run_python und tabelle_auswerten ⇒ Fähigkeit', () => {
    expect(clientCanUseTabularToolFrom(['run_python', 'tabelle_auswerten'])).toBe(true);
  });

  it('tabelle_auswerten ohne run_python oder ohne clientTools ⇒ keine Fähigkeit', () => {
    expect(clientCanUseTabularToolFrom(['tabelle_auswerten'])).toBe(false);
    expect(clientCanUseTabularToolFrom(undefined)).toBe(false);
    expect(clientCanUseTabularToolFrom([])).toBe(false);
  });

  const base = {
    hasTabularAttachment: true,
    enabledTools: {},
    agentConfig: { userId: 'u1' },
  };

  it('alter Client ⇒ nicht montierbar (Routing-Flag und Prompt folgen demselben Prädikat)', () => {
    expect(
      isTabelleAuswertenMountable({
        ...base,
        clientCanRunPython: true,
        clientCanUseTabularTool: clientCanUseTabularToolFrom(['run_python']),
      })
    ).toBe(false);
  });

  it('neuer Client ⇒ montierbar', () => {
    expect(
      isTabelleAuswertenMountable({
        ...base,
        clientCanRunPython: true,
        clientCanUseTabularTool: clientCanUseTabularToolFrom(['run_python', 'tabelle_auswerten']),
      })
    ).toBe(true);
  });
});

// Live 27.10.2026: statt zu rufen schrieb das Modell „Bitte bestätige den Aufruf
// des Analyse-Werkzeugs" bzw. „Dazu rufe ich nun das entsprechende Werkzeug auf."
describe('tabelle_auswerten Beschreibung', () => {
  it('verlangt den direkten Aufruf — die Freigabe fragt das System', () => {
    const description = makeTabelleAuswertenTool().description ?? '';
    expect(description).toContain('Rufe es direkt auf');
    expect(description).toContain('Freigabe fragt das System selbst');
    expect(description).toContain('nie im Text um Bestätigung');
  });
});

describe('tabelle_auswerten resolve', () => {
  beforeEach(() => codegenMock.mockReset());

  it('gibt den Auftrag als letzte Nutzerfrage an den Codegen und reicht den Code weiter', async () => {
    codegenMock.mockResolvedValueOnce({ pythonCode: 'print(1)' });
    const out = await tabelleAuswertenClientTool.resolve({
      threadId: 't1',
      state,
      args: { auftrag: 'Summe der Spalte Umsatz für März', modus: 'auswerten' },
      priorSteps: [],
    });
    expect(out).toEqual({ clientArgs: { code: 'print(1)' } });
    const [codegenState, opts] = codegenMock.mock.calls[0] as [ChatGraphState, unknown];
    expect(codegenState.messages.at(-1)).toEqual({
      role: 'user',
      content: 'Summe der Spalte Umsatz für März',
    });
    expect(opts).toEqual({ mode: 'analyze' });
    // Der Zustand des Zuges bleibt unberührt.
    expect(state.messages).toHaveLength(1);
  });

  // Live 27.10.2026 (T06_buchungen_500.xlsx): die grosse Tabelle wurde vektorisiert
  // (attachmentContext genullt), und im ersten Zug eines Threads lagen noch keine
  // Thread-Anhänge im Zustand. Die Freigabe-Fortsetzung stellt genau diesen Zustand
  // wieder her ⇒ „Missing question or table context". Seit 88d3e8b45a sind die
  // Anhänge beim Pausieren gespeichert — der Codegen holt sie sich.
  it('Zustand ohne Tabellenkontext ⇒ lädt die gespeicherten Thread-Anhänge für den Codegen', async () => {
    const table = {
      id: 'a1',
      name: 'T06_buchungen_500.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      isImage: false,
      extractedText: '| Datum | Betrag |\n| 2026-01-01 | 12 |',
      documentId: 'd1',
      summary: null,
      hasFileData: true,
    };
    threadAttachmentsMock.mockResolvedValueOnce([table]);
    codegenMock.mockResolvedValueOnce({ pythonCode: 'print(1)' });
    const resumed = {
      ...state,
      attachmentContext: null,
      threadAttachments: [],
    } as unknown as ChatGraphState;

    const out = await tabelleAuswertenClientTool.resolve({
      threadId: 't-resume',
      state: resumed,
      args: { auftrag: 'Summe aller Beträge' },
      priorSteps: [],
    });

    expect(out).toEqual({ clientArgs: { code: 'print(1)' } });
    expect(threadAttachmentsMock).toHaveBeenCalledWith('t-resume');
    const [codegenState] = codegenMock.mock.calls[0] as [ChatGraphState];
    expect(codegenState.threadAttachments).toEqual([table]);
    expect(codegenState.messages.at(-1)).toEqual({ role: 'user', content: 'Summe aller Beträge' });
  });

  it('Zustand mit Tabellen-Anhang ⇒ keine zusätzliche Abfrage', async () => {
    threadAttachmentsMock.mockClear();
    codegenMock.mockResolvedValueOnce({ pythonCode: 'print(1)' });
    await tabelleAuswertenClientTool.resolve({
      threadId: 't1',
      state: {
        ...state,
        threadAttachments: [
          { name: 'a.csv', mimeType: 'text/csv', isImage: false, extractedText: 'x,y\n1,2' },
        ],
      } as unknown as ChatGraphState,
      args: { auftrag: 'Summe' },
      priorSteps: [],
    });
    expect(threadAttachmentsMock).not.toHaveBeenCalled();
  });

  it('modus ausfuellen ⇒ mode fill', async () => {
    codegenMock.mockResolvedValueOnce({ pythonCode: 'print(2)' });
    await tabelleAuswertenClientTool.resolve({
      threadId: 't1',
      state,
      args: { auftrag: 'Trage die Summen ein', modus: 'ausfuellen' },
      priorSteps: [],
    });
    expect(codegenMock.mock.calls[0]?.[1]).toEqual({ mode: 'fill' });
  });

  it('ein gescheiterter Vorschritt geht als previousCode/previousError mit', async () => {
    codegenMock.mockResolvedValueOnce({ pythonCode: 'print(3)' });
    const priorSteps: PersistedStep[] = [
      {
        toolCallId: 'c0',
        toolName: TABELLE_AUSWERTEN_TOOL,
        args: { auftrag: 'Summe' },
        result: { error: "KeyError: 'Umsatz'", code: "df['Umsatz'].sum()" },
        ok: false,
      },
    ];
    await tabelleAuswertenClientTool.resolve({
      threadId: 't1',
      state,
      args: { auftrag: 'Summe der Spalte Umsatz (EUR)' },
      priorSteps,
    });
    expect(codegenMock.mock.calls[0]?.[1]).toEqual({
      mode: 'analyze',
      previousCode: "df['Umsatz'].sum()",
      previousError: "KeyError: 'Umsatz'",
    });
  });

  const failedRun = (n: number): PersistedStep => ({
    toolCallId: `c${n}`,
    toolName: TABELLE_AUSWERTEN_TOOL,
    args: { auftrag: 'Summe' },
    result: { error: 'KeyError', code: `print(${n})` },
    ok: false,
  });

  it('nach drei gescheiterten Läufen (Original + 2 Wiederholungen) ⇒ kein Codegen mehr', async () => {
    const out = await tabelleAuswertenClientTool.resolve({
      threadId: 't1',
      state,
      args: { auftrag: 'Summe der Spalte Umsatz' },
      priorSteps: [failedRun(1), failedRun(2), failedRun(3)],
    });
    expect(out).toEqual({
      error: 'Nicht mehr erneut versuchen — antworte ohne Rechnung und sag das.',
    });
    expect(codegenMock).not.toHaveBeenCalled();
  });

  it('nach zwei gescheiterten Läufen ⇒ noch ein Versuch', async () => {
    codegenMock.mockResolvedValueOnce({ pythonCode: 'print(9)' });
    const out = await tabelleAuswertenClientTool.resolve({
      threadId: 't1',
      state,
      args: { auftrag: 'Summe der Spalte Umsatz' },
      priorSteps: [failedRun(1), failedRun(2)],
    });
    expect(out).toEqual({ clientArgs: { code: 'print(9)' } });
    expect(codegenMock).toHaveBeenCalledTimes(1);
  });

  it('pythonCode null ⇒ Fehler „nicht aus der Tabelle berechnen"', async () => {
    codegenMock.mockResolvedValueOnce({ pythonCode: null });
    const out = await tabelleAuswertenClientTool.resolve({
      threadId: 't1',
      state,
      args: { auftrag: 'Wer ist Bundeskanzler?' },
      priorSteps: [],
    });
    expect(out).toEqual({ error: 'Diese Frage lässt sich nicht aus der Tabelle berechnen.' });
  });

  it('computeFailed ⇒ Fehler „Code konnte nicht erzeugt werden"', async () => {
    codegenMock.mockResolvedValueOnce({ pythonCode: null, computeFailed: true });
    const out = await tabelleAuswertenClientTool.resolve({
      threadId: 't1',
      state,
      args: { auftrag: 'Summe der Spalte Umsatz' },
      priorSteps: [],
    });
    expect(out).toEqual({ error: 'Code konnte nicht erzeugt werden.' });
  });
});

describe('tabelle_auswerten toToolResult', () => {
  const stored = {
    clientArgs: { code: 'print("Summe:", 42)' },
    classifiedState: {},
  } as unknown as StoredLoopClientToolState;
  let sent: Array<{ event: string; payload: unknown }>;
  let sse: SSEWriter;

  beforeEach(() => {
    sent = [];
    sse = {
      send: (event: string, payload: unknown) => sent.push({ event, payload }),
    } as unknown as SSEWriter;
    persistMock.mockReset().mockImplementation(async (_u: string, p: unknown) => p);
  });

  it('Fehler aus dem Browser ⇒ Fehlerergebnis mit Code, kein compute-Event', async () => {
    const out = await tabelleAuswertenClientTool.toToolResult({
      threadId: 't1',
      stored,
      result: { ok: false, error: "TypeError: unsupported operand type(s) for +: 'int' and 'str'" },
      sse,
      userId: 'u1',
    });
    expect(String(out.toolResult.error)).toContain('TypeError');
    expect(out.toolResult.code).toBe('print("Summe:", 42)');
    expect(out.ok).toBe(false);
    expect(out.classifiedStatePatch).toBeUndefined();
    expect(sent.some((s) => s.event === 'compute')).toBe(false);
  });

  it('kürzt einen langen Fehlertext auf 1500 Zeichen', async () => {
    const out = await tabelleAuswertenClientTool.toToolResult({
      threadId: 't1',
      stored,
      result: { error: 'x'.repeat(5000) },
      sse,
      userId: 'u1',
    });
    expect(String(out.toolResult.error).length).toBeLessThanOrEqual(1500);
  });

  it('nan-Ergebnis ⇒ als Fehler zurück, kein compute-Event', async () => {
    const out = await tabelleAuswertenClientTool.toToolResult({
      threadId: 't1',
      stored,
      result: {
        operation: 'Tabellen-Berechnung',
        entries: [{ label: 'Summe', value: 'nan' }],
        summary: 'Summe: nan',
      },
      sse,
      userId: 'u1',
    });
    expect(out.ok).toBe(false);
    expect(typeof out.toolResult.error).toBe('string');
    expect(sent.some((s) => s.event === 'compute')).toBe(false);
  });

  it('Erfolg ⇒ compute-Event, frisches Ergebnis im Zustand, gekürzte Ausgabe', async () => {
    const summary = `Summe: 42\n${'y'.repeat(6000)}`;
    const out = await tabelleAuswertenClientTool.toToolResult({
      threadId: 't1',
      stored,
      result: {
        operation: 'Tabellen-Berechnung',
        entries: [{ label: 'Summe', value: '42' }],
        summary,
        files: [{ name: 'export.csv', b64: 'QQ==' }],
        // Vom Client gesetzte Asset-URLs werden verworfen.
        figureUrls: ['https://evil.example/x.png'],
      },
      sse,
      userId: 'u1',
    });
    const persisted = persistMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(persistMock.mock.calls[0]?.[0]).toBe('u1');
    expect(persisted.figureUrls).toBeUndefined();
    expect(sent.find((s) => s.event === 'compute')?.payload).toEqual({ compute: persisted });
    expect(out.classifiedStatePatch?.computedResultFresh).toBe(true);
    expect(out.classifiedStatePatch?.computedResult).toEqual(persisted);
    expect(String(out.toolResult.ergebnis).length).toBeLessThanOrEqual(4000);
    expect(String(out.toolResult.ergebnis)).toContain('Summe: 42');
    expect(out.toolResult.dateien).toEqual(['export.csv']);
    expect(out.toolResult.code).toBe('print("Summe:", 42)');
    expect(out.ok).toBeUndefined();
  });
});
