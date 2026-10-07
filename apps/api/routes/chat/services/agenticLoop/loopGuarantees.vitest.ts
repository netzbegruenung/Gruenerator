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
  ask: string,
  toolName = 'edit_document',
  sources = ''
): { run: () => Promise<void>; execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn().mockResolvedValue({ ok: true, operationCount: 1 });
  const ctx: GuaranteeContext = {
    state: {
      editToolSurface: 'board',
      intent: 'agentic',
      ...stateOverrides,
    } as unknown as ChatGraphState,
    messages: [{ role: 'user', content: ask }] as ModelMessage[],
    tools: { [toolName]: { execute } } as unknown as ToolSet,
    sourceRegistry: {
      renderReference: () => sources,
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

  it('erzwingt auch edit_current_sharepic, wenn der Spec-Pfad statt edit_document montiert ist', async () => {
    const { run, execute } = harness(
      { editToolSurface: 'canvas', intent: 'edit_current_doc' },
      'Mach die Headline kürzer',
      'edit_current_sharepic'
    );
    await run();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('hängt dem Spec-Pfad die Quellen nicht an — das Werkzeug tut es selbst', async () => {
    const { run, execute } = harness(
      { editToolSurface: 'canvas', intent: 'edit_current_doc' },
      'Mach die Headline kürzer',
      'edit_current_sharepic',
      '[1] Quelle'
    );
    await run();
    expect(execute.mock.calls[0][0]).toEqual({ instruction: 'Mach die Headline kürzer' });
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

  it('erzwingt auch auf der Dokument-Fläche — dort versendet das Werkzeug statt zu planen', async () => {
    // Seit #3428 ist `doc` eine Werkzeug-Fläche wie die anderen: übergeht der
    // Planer sie, gibt es gar keinen Bearbeitungsweg mehr (die Klassifikator-
    // Stufe, die früher `trigger_doc_edit` schickte, ist weg).
    const { run, execute } = harness({ editToolSurface: 'doc' }, 'Kürze den ersten Absatz');
    await run();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toEqual({ instruction: 'Kürze den ersten Absatz' });

    const frage = harness({ editToolSurface: 'doc' }, 'Worum geht es im ersten Absatz?');
    await frage.run();
    expect(frage.execute).not.toHaveBeenCalled();
  });

  it('nimmt für Tabellen/Präsentationen das Dokument-Muster', async () => {
    const sheet = harness({ editToolSurface: 'sheet' }, 'Ergänze die Spalte Kosten');
    await sheet.run();
    expect(sheet.execute).toHaveBeenCalledTimes(1);

    const frage = harness({ editToolSurface: 'sheet' }, 'Was steht in Spalte B?');
    await frage.run();
    expect(frage.execute).not.toHaveBeenCalled();
  });

  it('erzwingt auf dem Canvas auch Layout-Bitten, die das Dokument-Muster nicht kennt', async () => {
    // Live 07.10.2026 (b1-e3): „Verschieb den Text nach oben" auf einem offenen
    // Sharepic, intent ohne edit_current_*, Planer rief nichts, steps=0 — und
    // die Antwort behauptete die Verschiebung.
    for (const toolName of ['edit_current_sharepic', 'edit_document']) {
      for (const ask of [
        'Verschieb den Text nach oben',
        'Schrift der Headline größer',
        'Hintergrundfarbe auf Mint bitte',
        'Das Logo weg',
        'Zentriere die Headline',
        'Mach die Schrift größer',
        'Hintergrund auf Sand',
        'Kannst du die Headline kürzer machen?',
        'Rück das Logo nach links',
      ]) {
        const { run, execute } = harness({ editToolSurface: 'canvas' }, ask, toolName);
        await run();
        expect(execute, `${toolName}: ${ask}`).toHaveBeenCalledTimes(1);
        expect(execute.mock.calls[0][0]).toEqual({ instruction: ask });
      }
    }
  });

  it('lässt Fragen, Recherche und Gespräch auf dem Canvas unangetastet', async () => {
    for (const ask of [
      'Welche Farbe hat der Hintergrund?',
      'Was steht auf Folie 2?',
      'Warum ist die Headline kleiner als die Dachzeile?',
      'Wie wirkt das Sharepic auf dich?',
      // Review 07.10.2026: Recherche, Gespräch und Fragen, die die alten
      // Wortstämme (rück-, beweg-, dreh-, wechsel-, höher, weg) trafen.
      'Recherchiere, ob die Mieten in Berlin höher sind als in München',
      'Such mir den Spiegel-Artikel dazu',
      'Gib mir einen Rückblick auf die Klimapolitik 2025',
      'Recherchiere die Rückkehr der Wölfe',
      'Erzähl mir mehr über die Bewegung',
      'Finde Zahlen zu Wechselwählern',
      'Hast du Ideen für ein Drehbuch?',
      'Sind kleinere Parteien betroffen?',
      'Passt die Farbe zu unserem CD?',
      'Ist die Schrift größer als bei der letzten Version?',
      'Findest du, die Headline sollte größer sein?',
      'Danke, das reicht. Ich muss weg',
    ]) {
      const { run, execute } = harness({ editToolSurface: 'canvas' }, ask, 'edit_current_sharepic');
      await run();
      expect(execute, ask).not.toHaveBeenCalled();
    }
  });

  it('nimmt die Layout-Wörter nur auf dem Canvas — ein Dokument verschiebt nichts', async () => {
    const { run, execute } = harness({ editToolSurface: 'doc' }, 'Schrift der Headline größer');
    await run();
    expect(execute).not.toHaveBeenCalled();
  });
});
