import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCanvasEditorStore } from '../stores/createCanvasEditorStore';

import { createCanvasCommands } from './canvasCommands';

import type { CanvasItem } from './canvasLayerManager';
import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { LayoutResult } from '../configs/types';

/**
 * Jeder Befehl sagt genau einmal an, was er getan hat (WCAG 4.1.3) — geprüft
 * über die Tür `announce` des Befehls-Kontexts, nicht über die Oberfläche.
 */

type Text = { id: string; text: string; x: number; y: number };

function page(texts: Text[]) {
  let current = { additionalTexts: texts, layerOrder: texts.map((t) => t.id) } as Record<
    string,
    unknown
  >;
  const announce = vi.fn<(text: string) => void>();
  const store = createCanvasEditorStore();
  const items = (): CanvasItem[] =>
    (current.additionalTexts as Text[]).map(
      (data) => ({ id: data.id, type: 'additional-text', data }) as unknown as CanvasItem
    );
  const commands = createCanvasCommands<BaseCanvasState>({
    store,
    getState: () => current as unknown as BaseCanvasState,
    setState: (next) => {
      current = typeof next === 'function' ? next(current as never) : { ...current, ...next };
    },
    saveToHistory: vi.fn(),
    runHistoryBatch: (fn) => fn(),
    getActions: () => ({
      removeAdditionalText: (id: string) => {
        current = {
          ...current,
          additionalTexts: (current.additionalTexts as Text[]).filter((t) => t.id !== id),
        };
      },
    }),
    template: () => null,
    getRenderList: items,
    getStage: () => null,
    logicalScale: () => 1,
    getElements: () => [],
    getLayout: () => ({}) as LayoutResult,
    isReadOnly: () => false,
    getPageSize: () => ({ width: 1000, height: 500 }),
    announce,
  });
  return {
    commands,
    announce,
    select: (...ids: string[]) => store.getState().setSelectedLayers(ids),
  };
}

const two = (): Text[] => [
  { id: 't1', text: 'Klimaschutz', x: 0, y: 0 },
  { id: 't2', text: 'Wärme', x: 10, y: 10 },
];

describe('Ansagen der Befehle', () => {
  let p: ReturnType<typeof page>;
  beforeEach(() => {
    p = page(two());
  });

  it('kopiert: nennt das Element', () => {
    p.select('t1');
    p.commands.copy();
    expect(p.announce).toHaveBeenCalledExactlyOnceWith('Kopiert: Text: Klimaschutz');
  });

  it('kopiert mehrere: zählt', () => {
    p.select('t1', 't2');
    p.commands.copy();
    expect(p.announce).toHaveBeenCalledExactlyOnceWith('2 Elemente kopiert');
  });

  it('löscht: nennt das Element, einmal', () => {
    p.select('t1');
    p.commands.remove();
    expect(p.announce).toHaveBeenCalledExactlyOnceWith('Gelöscht: Text: Klimaschutz');
  });

  it('löscht mehrere: zählt', () => {
    p.select('t1', 't2');
    p.commands.remove();
    expect(p.announce).toHaveBeenCalledExactlyOnceWith('2 Elemente gelöscht');
  });

  it('schneidet aus: sagt nur „Ausgeschnitten“, nicht auch „Kopiert“ und „Gelöscht“', () => {
    p.select('t2');
    p.commands.cut();
    expect(p.announce).toHaveBeenCalledExactlyOnceWith('Ausgeschnitten: Text: Wärme');
  });

  it('fügt ein', () => {
    p.select('t1');
    p.commands.copy();
    p.announce.mockClear();
    p.commands.paste(null);
    expect(p.announce).toHaveBeenCalledExactlyOnceWith('Element eingefügt');
  });

  it('dupliziert', () => {
    p.select('t1');
    p.commands.duplicate();
    expect(p.announce).toHaveBeenCalledExactlyOnceWith('Dupliziert: Text: Klimaschutz');
  });

  it('sperrt und entsperrt', () => {
    p.select('t1');
    p.commands.toggleLock();
    p.commands.toggleLock();
    expect(p.announce.mock.calls.map(([text]) => text)).toEqual([
      'Gesperrt: Text: Klimaschutz',
      'Entsperrt: Text: Klimaschutz',
    ]);
  });

  it.each([
    ['front', 'Ganz nach vorn'],
    ['forward', 'Eine Ebene nach vorn'],
    ['backward', 'Eine Ebene nach hinten'],
    ['back', 'Ganz nach hinten'],
  ] as const)('schiebt die Ebene (%s)', (step, text) => {
    // t1 liegt hinten, t2 vorn; je Schritt steht das Element so, dass es sich bewegen lässt.
    p = page([...two(), { id: 't3', text: 'Mitte', x: 0, y: 0 }]);
    p.select(step === 'front' || step === 'forward' ? 't1' : 't3');
    p.commands.moveLayer(step);
    expect(p.announce).toHaveBeenCalledExactlyOnceWith(text);
  });

  it('schweigt, wenn nichts geschah', () => {
    p.select();
    p.commands.copy();
    p.commands.remove();
    p.commands.duplicate();
    expect(p.announce).not.toHaveBeenCalled();
  });
});
