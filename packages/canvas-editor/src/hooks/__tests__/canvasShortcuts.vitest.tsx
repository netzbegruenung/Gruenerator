import { renderHook } from '@testing-library/react';
import Konva from 'konva';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCanvasEditorStore } from '../../stores/createCanvasEditorStore';
import { CanvasClipboard } from '../../utils/canvasClipboard';
import {
  CANVAS_COMMAND_IDS,
  shortcutOf,
  type CanvasCommandId,
} from '../../utils/canvasCommandRegistry';
import { createCanvasCommands, type CanvasCommands } from '../../utils/canvasCommands';
import { CANVAS_ITEM_ID_ATTR, CANVAS_ITEM_NAME } from '../../utils/deepSelect';
import { useCanvasKeyboardHandlers } from '../useCanvasKeyboardHandlers';

import type { BaseCanvasState } from '../../configs/factory/baseTypes';
import type { LayoutResult } from '../../configs/types';

/**
 * Die Kürzel im Menü und die, auf die die Tastatur hört, kommen aus derselben
 * Tabelle. Dieser Test hält die zweite Hälfte fest: für jedes Kürzel der
 * Tabelle wird genau der Tastendruck gebaut, den sie beschreibt, und es muss
 * die Tür des Befehls laufen.
 */

/** Welche Tür ein Befehl mit Kürzel öffnet. */
const DOOR: Partial<Record<CanvasCommandId, keyof CanvasCommands>> = {
  copy: 'copy',
  cut: 'cut',
  paste: 'paste',
  duplicate: 'duplicate',
  delete: 'remove',
  selectAll: 'selectAll',
  insertFrameImage: 'insertFrameImage',
  editText: 'editText',
  flipHorizontal: 'flip',
  flipVertical: 'flip',
};

function mockCommands(canEditText = true): CanvasCommands {
  return {
    capabilities: vi.fn(() => ({ canEditText })),
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    selectAll: vi.fn(),
    moveLayer: vi.fn(),
    toggleLock: vi.fn(),
    insertFrameImage: vi.fn(() => true),
    editText: vi.fn(),
    setRotation: vi.fn(),
    previewRotation: vi.fn(),
    flip: vi.fn(),
    run: vi.fn(),
  } as unknown as CanvasCommands;
}

function mountKeys(selection: string[] = ['shape-1'], canEditText = true) {
  const store = createCanvasEditorStore();
  store.getState().setSelectedLayers(selection);
  const commands = mockCommands(canEditText);
  renderHook(() =>
    useCanvasKeyboardHandlers({
      store,
      state: {} as BaseCanvasState,
      actions: {},
      setState: vi.fn(),
      setSelectedElement: (id) => store.getState().setSelectedElement(id),
      commands,
    })
  );
  return { store, commands };
}

const keydown = (init: KeyboardEventInit, target: EventTarget = window) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  });

describe('Kürzel aus dem Befehlsregister', () => {
  const withShortcut = CANVAS_COMMAND_IDS.filter((id) => shortcutOf(id) !== null);

  it('kennt für jeden Befehl mit Kürzel eine Tür', () => {
    expect(withShortcut.filter((id) => DOOR[id] === undefined)).toEqual([]);
  });

  it.each(withShortcut)('%s öffnet seine Tür', (id) => {
    const shortcut = shortcutOf(id)!;
    for (const key of [shortcut.key, ...shortcut.alsoKeys]) {
      const { commands } = mountKeys();
      keydown({ key, ctrlKey: shortcut.mod, shiftKey: shortcut.shift });
      expect(commands[DOOR[id]!]).toHaveBeenCalledTimes(1);
    }
  });

  it('greift im offenen Kontextmenü nicht — Pfeile und Enter gehören dem Menü', () => {
    const { commands, store } = mountKeys();
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const item = document.createElement('div');
    menu.appendChild(item);
    document.body.appendChild(menu);

    keydown({ key: 'Enter' }, item);
    keydown({ key: 'Delete' }, item);
    keydown({ key: 'Escape' }, item);

    expect(commands.insertFrameImage).not.toHaveBeenCalled();
    expect(commands.remove).not.toHaveBeenCalled();
    expect(store.getState().selectedLayerIds).toEqual(['shape-1']);
    menu.remove();
  });

  it('bearbeitet mit F2 den ausgewählten Text', () => {
    const { commands } = mountKeys(['headline']);
    keydown({ key: 'F2' });
    expect(commands.editText).toHaveBeenCalledTimes(1);
  });

  it('bearbeitet mit F2 nur einen Text — ein Bild ginge sonst in den Ausschnitt', () => {
    const { commands } = mountKeys(['u-1'], false);
    keydown({ key: 'F2' });
    expect(commands.editText).not.toHaveBeenCalled();
  });

  it('spiegelt mit ⇧H horizontal und mit ⇧V vertikal', () => {
    const { commands } = mountKeys();
    keydown({ key: 'H', shiftKey: true });
    keydown({ key: 'V', shiftKey: true });
    expect(commands.flip).toHaveBeenNthCalledWith(1, 'x');
    expect(commands.flip).toHaveBeenNthCalledWith(2, 'y');
  });

  it('lässt ⇧H im Textfeld dem Text — es wird ein „H“, kein Spiegeln', () => {
    const { commands } = mountKeys();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    keydown({ key: 'H', shiftKey: true }, textarea);
    expect(commands.flip).not.toHaveBeenCalled();
    textarea.remove();
  });

  it('macht aus ⇧C, ⇧D und ⇧Entf nichts', () => {
    const { commands } = mountKeys();
    keydown({ key: 'C', shiftKey: true });
    keydown({ key: 'D', shiftKey: true });
    keydown({ key: 'Delete', shiftKey: true });
    expect(commands.copy).not.toHaveBeenCalled();
    expect(commands.duplicate).not.toHaveBeenCalled();
    expect(commands.remove).not.toHaveBeenCalled();
  });

  it('dupliziert ohne Auswahl nicht, damit Strg+D dem Browser bleibt', () => {
    const { commands } = mountKeys([]);
    const event = new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(commands.duplicate).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('Türen mit Mehrfachauswahl', () => {
  afterEach(() => CanvasClipboard.clear());

  function setup() {
    const store = createCanvasEditorStore();
    let state = {
      shapeInstances: [
        { id: 'a', type: 'rect', x: 10, y: 10 },
        { id: 'b', type: 'rect', x: 50, y: 50 },
      ],
    } as unknown as BaseCanvasState;
    const removeShape = vi.fn((id: string) => {
      state = { ...state, shapeInstances: state.shapeInstances.filter((s) => s.id !== id) };
    });
    const runHistoryBatch = vi.fn((fn: () => void) => fn());
    const saveToHistory = vi.fn();
    const commands = createCanvasCommands<BaseCanvasState>({
      store,
      getState: () => state,
      setState: (next) => {
        state = typeof next === 'function' ? next(state) : { ...state, ...next };
      },
      saveToHistory,
      runHistoryBatch,
      getActions: () => ({ removeShape }),
      template: () => null,
      getRenderList: () => [],
      getStage: () => null,
      logicalScale: () => 1,
      getElements: () => [],
      getLayout: () => ({}) as LayoutResult,
      isReadOnly: () => false,
      getPageSize: () => ({ width: 1000, height: 1000 }),
    });
    store.getState().setSelectedLayers(['a', 'b']);
    return { store, commands, state: () => state, removeShape, runHistoryBatch, saveToHistory };
  }

  it('löscht mehrere Elemente in einem Schritt', () => {
    const h = setup();
    h.commands.remove();
    expect(h.removeShape).toHaveBeenCalledTimes(2);
    expect(h.runHistoryBatch).toHaveBeenCalledTimes(1);
    expect(h.store.getState().selectedLayerIds).toEqual([]);
  });

  it('dupliziert mehrere Elemente mit einem Verlaufseintrag und wählt die Kopien', () => {
    const h = setup();
    h.commands.duplicate();
    expect(h.state().shapeInstances).toHaveLength(4);
    expect(h.saveToHistory).toHaveBeenCalledTimes(1);
    const copies = h
      .state()
      .shapeInstances.slice(2)
      .map((s) => s.id);
    expect(h.store.getState().selectedLayerIds).toEqual(copies);
  });

  it('kopiert und fügt mehrere Elemente gemeinsam ein', () => {
    const h = setup();
    h.commands.copy();
    h.commands.paste(null);
    expect(h.state().shapeInstances.map((s) => [s.x, s.y])).toEqual([
      [10, 10],
      [50, 50],
      [30, 30],
      [70, 70],
    ]);
    expect(h.saveToHistory).toHaveBeenCalledTimes(1);
  });

  it('schneidet aus: kopiert und löscht', () => {
    const h = setup();
    h.commands.cut();
    expect(h.state().shapeInstances).toHaveLength(0);
    expect(CanvasClipboard.paste()?.entries).toHaveLength(2);
  });
});

describe('Alles auswählen', () => {
  it('nimmt nur, was sich ziehen lässt — wie ein Rahmen über die ganze Fläche', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = new Konva.Stage({ container, width: 200, height: 200 });
    const layer = new Konva.Layer();
    stage.add(layer);
    const item = (id: string, draggable: boolean) => {
      const group = new Konva.Group({ name: CANVAS_ITEM_NAME, [CANVAS_ITEM_ID_ATTR]: id });
      group.add(new Konva.Rect({ width: 10, height: 10, draggable }));
      layer.add(group);
    };
    item('background', false);
    item('a', true);
    item('b', true);

    const store = createCanvasEditorStore();
    const commands = createCanvasCommands<BaseCanvasState>({
      store,
      getState: () => ({}) as BaseCanvasState,
      setState: vi.fn(),
      saveToHistory: vi.fn(),
      runHistoryBatch: (fn) => fn(),
      getActions: () => ({}),
      template: () => null,
      getRenderList: () => [],
      getStage: () => stage,
      logicalScale: () => 1,
      getElements: () => [],
      getLayout: () => ({}) as LayoutResult,
      isReadOnly: () => false,
      getPageSize: () => ({ width: 1000, height: 1000 }),
    });
    commands.selectAll();
    expect(store.getState().selectedLayerIds).toEqual(['a', 'b']);
    stage.destroy();
    container.remove();
  });
});
