/**
 * Die Bearbeitungs-Zusicherung: wann führt der Turn `edit_document` selbst aus,
 * wenn der geteilte Planer es übergangen hat?
 *
 * Der Anlass steht in `loopGuarantees.ts`: eine Board-Bitte, die der
 * Klassifikator nicht auf `edit_current_board` legte, ging mit steps=0 durch und
 * endete als „keine passende Antwort". Deshalb prüfen die Fälle hier BEIDE
 * Richtungen — die Bitte muss die Änderung auslösen, die blosse Frage darf es
 * nicht.
 */
import { describe, it, expect, vi } from 'vitest';

import { createAfterGather, type GuaranteeContext } from './loopGuarantees.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage, ToolSet } from 'ai';

function harness(
  stateOverrides: Partial<ChatGraphState>,
  ask: string
): { run: () => Promise<void>; execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn().mockResolvedValue({ ok: true, operationCount: 1 });
  const ctx: GuaranteeContext = {
    state: {
      editToolSurface: 'board',
      intent: 'agentic',
      ...stateOverrides,
    } as unknown as ChatGraphState,
    messages: [{ role: 'user', content: ask }] as ModelMessage[],
    tools: { edit_document: { execute } } as unknown as ToolSet,
    sourceRegistry: {
      renderReference: () => '',
      renderAll: () => '',
    } as unknown as GuaranteeContext['sourceRegistry'],
    sse: { send: vi.fn() } as unknown as GuaranteeContext['sse'],
    recordStep: vi.fn(),
    emitOpeningBeforeTool: vi.fn(),
    answerText: () => '',
    onInfo: vi.fn(),
    onWarn: vi.fn(),
  };
  return { run: createAfterGather(ctx), execute };
}

describe('Bearbeitungs-Zusicherung — der Text entscheidet mit, nicht nur der Intent', () => {
  it('erzwingt die Bearbeitung, wenn der Klassifikator die Board-Bitte verfehlt hat', async () => {
    // Der live beobachtete Fall (19.08.2026): intent=agentic, Planer ruft nichts.
    const { run, execute } = harness({}, 'Erstelle eine Aufgabe „Plakate bestellen" in To-Do');
    await run();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toEqual({
      instruction: 'Erstelle eine Aufgabe „Plakate bestellen" in To-Do',
    });
  });

  it('lässt eine reine Frage ans Board unangetastet', async () => {
    const { run, execute } = harness({}, 'Wie viele Aufgaben sind noch offen?');
    await run();
    expect(execute).not.toHaveBeenCalled();
  });

  it('bleibt beim Intent-Kriterium, auch wenn der Text kein Muster trifft', async () => {
    const { run, execute } = harness({ intent: 'edit_current_board' }, 'mach das nochmal');
    await run();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rührt sich nicht, wenn der Planer schon bearbeitet hat', async () => {
    const { run, execute } = harness(
      { editorEditsSummary: '1 Änderung am Board (Aufgabe angelegt)' },
      'Erstelle eine Aufgabe „Plakate bestellen" in To-Do'
    );
    await run();
    expect(execute).not.toHaveBeenCalled();
  });

  it('greift ohne Editor-Fläche gar nicht', async () => {
    const { run, execute } = harness(
      { editToolSurface: null },
      'Erstelle eine Aufgabe „Plakate bestellen" in To-Do'
    );
    await run();
    expect(execute).not.toHaveBeenCalled();
  });

  it('nimmt für Tabellen/Präsentationen das Dokument-Muster', async () => {
    const sheet = harness({ editToolSurface: 'sheet' }, 'Ergänze die Spalte Kosten');
    await sheet.run();
    expect(sheet.execute).toHaveBeenCalledTimes(1);

    const frage = harness({ editToolSurface: 'sheet' }, 'Was steht in Spalte B?');
    await frage.run();
    expect(frage.execute).not.toHaveBeenCalled();
  });
});
