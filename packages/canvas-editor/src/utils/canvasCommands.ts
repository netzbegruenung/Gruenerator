/**
 * Die Türen der Befehle einer Seite: Kopieren, Einfügen, Duplizieren, Löschen,
 * Ebenen, Alles auswählen. Tastatur, Kontextleiste, Pille und Kontextmenü
 * rufen dieselbe Funktion — vorher war jede Aktion je Oberfläche von Hand
 * verdrahtet, und Strg+C kannte keine Mehrfachauswahl, während Entf sie kannte.
 *
 * Gelesen wird beim Aufruf: Auswahl aus dem Store, Zustand als der committete.
 * Eine Mehrfach-Aktion ist ein Schritt im Verlauf.
 */

import { CanvasClipboard } from './canvasClipboard';
import { moveLayerTo, type CanvasItem, type LayerStep } from './canvasLayerManager';
import { itemBodyRect } from './deepSelect';
import {
  DUPLICATE_OFFSET,
  duplicateElementInState,
  findDuplicableEntry,
  insertInstance,
  type DuplicableEntry,
  type InsertOffset,
  type TemplateEntryLookup,
} from './duplicateElement';
import { locateDrop } from './mediaDrop';
import { selectableItemIds } from './multiSelect';
import { findElementRemover } from './removeElement';
import { selectionCapabilities, type SelectionCapabilities } from './selectionCapabilities';

import type { PageCommandId } from './canvasCommandRegistry';
import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';
import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';
import type Konva from 'konva';

export interface ClientPoint {
  clientX: number;
  clientY: number;
}

export interface CanvasCommandContext<TState extends Partial<BaseCanvasState>> {
  store: CanvasEditorStoreApi;
  /** Der committete Zustand der Seite. */
  getState: () => TState;
  setState: (next: TState) => void;
  saveToHistory: (state: TState) => void;
  runHistoryBatch: (fn: () => void) => void;
  getActions: () => OptionalCanvasActions;
  /** Vorlagen-Elemente als Instanz — siehe `findTemplateEntry`. */
  template: TemplateEntryLookup;
  getRenderList: () => readonly CanvasItem[];
  getStage: () => Konva.Stage | null;
  /** Formatbreite durch Vorlagenbreite — die Skala der Gruppe in `CanvasStage`. */
  logicalScale: () => number;
}

export interface CanvasCommands {
  capabilities: () => SelectionCapabilities;
  copy: () => void;
  cut: () => void;
  /** Mit `at` landet die linke obere Ecke der kopierten Auswahl dort. */
  paste: (at: ClientPoint | null) => void;
  duplicate: () => void;
  remove: () => void;
  selectAll: () => void;
  moveLayer: (step: LayerStep) => void;
  /** Öffnet die Dateiauswahl für den ausgewählten Rahmen; false ohne Rahmen. */
  insertFrameImage: () => boolean;
  editText: () => void;
  run: (id: PageCommandId, at: ClientPoint | null) => void;
}

export function createCanvasCommands<TState extends Partial<BaseCanvasState>>(
  ctx: CanvasCommandContext<TState>
): CanvasCommands {
  const selection = () => ctx.store.getState().selectedLayerIds;

  const commit = (next: TState, selectIds: readonly string[]) => {
    ctx.setState(next);
    // `setState` allein schreibt keinen Verlauf; ohne den Eintrag ließe sich
    // die Änderung nicht rückgängig machen.
    ctx.saveToHistory(next);
    ctx.store.getState().setSelectedLayers([...selectIds]);
  };

  const measure = (ids: readonly string[]) => {
    const stage = ctx.getStage();
    if (!stage) return null;
    const scale = ctx.logicalScale();
    const rects = ids.map((id) => itemBodyRect(stage, id, stage)).filter((rect) => rect !== null);
    if (rects.length === 0) return null;
    const x = Math.min(...rects.map((r) => r.x));
    const y = Math.min(...rects.map((r) => r.y));
    const right = Math.max(...rects.map((r) => r.x + r.width));
    const bottom = Math.max(...rects.map((r) => r.y + r.height));
    return { x: x / scale, y: y / scale, width: (right - x) / scale, height: (bottom - y) / scale };
  };

  const copy = () => {
    const ids = selection();
    const state = ctx.getState();
    const entries = ids
      .map((id) => findDuplicableEntry(state, id, ctx.template))
      .filter((entry): entry is DuplicableEntry => entry !== null);
    if (entries.length === 0) return;
    CanvasClipboard.copy({ entries, bounds: measure(ids) });
  };

  const remove = () => {
    const state = ctx.getState();
    const actions = ctx.getActions();
    const removers = selection()
      .map((id) => findElementRemover(state, actions, id))
      .filter((remove) => remove !== null);
    if (removers.length === 0) return;
    if (removers.length === 1) removers[0]!();
    else ctx.runHistoryBatch(() => removers.forEach((remove) => remove()));
    ctx.store.getState().setSelectedElement(null);
  };

  const paste = (at: ClientPoint | null) => {
    const content = CanvasClipboard.paste();
    if (!content) return;
    let offset: InsertOffset = { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET };
    const stage = ctx.getStage();
    if (at && content.bounds && stage) {
      const drop = locateDrop(stage, at, ctx.logicalScale());
      if (drop) offset = { x: drop.point.x - content.bounds.x, y: drop.point.y - content.bounds.y };
    }
    let next = ctx.getState();
    const newIds: string[] = [];
    for (const entry of content.entries) {
      const result = insertInstance(next, entry, { offset });
      next = result.state;
      newIds.push(result.newId);
    }
    commit(next, newIds);
  };

  const duplicate = () => {
    let next = ctx.getState();
    const newIds: string[] = [];
    for (const id of selection()) {
      const result = duplicateElementInState(next, id, { template: ctx.template });
      if (!result) continue;
      next = result.state;
      newIds.push(result.newId);
    }
    if (newIds.length > 0) commit(next, newIds);
  };

  const moveLayer = (step: LayerStep) => {
    const id = ctx.store.getState().selectedElement;
    if (!id) return;
    const renderList = ctx.getRenderList();
    const layerOrder = moveLayerTo(renderList, id, step);
    if (layerOrder.every((itemId, i) => itemId === renderList[i]?.id)) return;
    const next = { ...ctx.getState(), layerOrder };
    ctx.setState(next);
    ctx.saveToHistory(next);
  };

  const insertFrameImage = () => {
    const id = ctx.store.getState().selectedElement;
    const setFrameImage = ctx.getActions().setFrameImage;
    if (!id || !setFrameImage || !ctx.getState().frameInstances?.some((f) => f.id === id)) {
      return false;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) setFrameImage(id, file, URL.createObjectURL(file));
      input.remove();
    });
    input.click();
    return true;
  };

  /** Derselbe Weg wie ein Doppelklick: der Text-Knoten öffnet seinen Editor selbst. */
  const editText = () => {
    const id = ctx.store.getState().selectedElement;
    if (id) ctx.getStage()?.findOne(`#${id}`)?.fire('dblclick', {}, false);
  };

  const selectAll = () => {
    const layer = ctx.getStage()?.getLayers()[0];
    if (layer) ctx.store.getState().setSelectedLayers(selectableItemIds(layer));
  };

  const commands: Omit<CanvasCommands, 'run'> = {
    capabilities: () =>
      selectionCapabilities({
        ids: selection(),
        state: ctx.getState(),
        actions: ctx.getActions(),
        template: ctx.template,
        renderList: ctx.getRenderList(),
      }),
    copy,
    cut: () => {
      copy();
      remove();
    },
    paste,
    duplicate,
    remove,
    selectAll,
    moveLayer,
    insertFrameImage,
    editText,
  };

  const run = (id: PageCommandId, at: ClientPoint | null) => {
    switch (id) {
      case 'copy':
        return commands.copy();
      case 'cut':
        return commands.cut();
      case 'paste':
        return paste(null);
      case 'pasteHere':
        return paste(at);
      case 'duplicate':
        return duplicate();
      case 'delete':
        return remove();
      case 'selectAll':
        return selectAll();
      case 'bringToFront':
        return moveLayer('front');
      case 'bringForward':
        return moveLayer('forward');
      case 'sendBackward':
        return moveLayer('backward');
      case 'sendToBack':
        return moveLayer('back');
      case 'toggleLock':
        return;
      case 'editText':
        return editText();
      case 'insertFrameImage':
        insertFrameImage();
        return;
    }
  };

  return { ...commands, run };
}
