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
import { lockedIdsOf, toggledLocks } from './layerLock';
import { locateDrop } from './mediaDrop';
import { findDragNodes, selectableItemIds } from './multiSelect';
import {
  axisAlignedBounds,
  centreOf,
  normalizeRotation,
  placeKeepingCentre,
  readNodeFrame,
  type NodeFrame,
} from './orientation';
import {
  findOrientationDoor,
  type OrientationDoor,
  type OrientationDoorInput,
  type OrientationPatch,
} from './orientElement';
import { findElementRemover } from './removeElement';
import {
  lockableIds,
  selectionCapabilities,
  type SelectionCapabilities,
} from './selectionCapabilities';

import type { PageCommandId } from './canvasCommandRegistry';
import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { CanvasElementConfig, LayoutResult } from '../configs/types';
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
  setState: (next: Partial<TState> | ((prev: TState) => TState)) => void;
  saveToHistory: (state: TState) => void;
  runHistoryBatch: (fn: () => void) => void;
  getActions: () => OptionalCanvasActions;
  /** Vorlagen-Elemente als Instanz — siehe `findTemplateEntry`. */
  template: TemplateEntryLookup;
  getRenderList: () => readonly CanvasItem[];
  getStage: () => Konva.Stage | null;
  /** Formatbreite durch Vorlagenbreite — die Skala der Gruppe in `CanvasStage`. */
  logicalScale: () => number;
  /** Config-Elemente der Vorlage — für Drehen & Spiegeln von Vorlagen-Elementen. */
  getElements: () => readonly CanvasElementConfig[];
  getLayout: () => LayoutResult;
  /** Lesemodus: Drehen & Spiegeln tun nichts. */
  isReadOnly: () => boolean;
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
  /** Sperrt die Auswahl, oder entsperrt sie, wenn schon alles gesperrt ist. */
  toggleLock: () => void;
  /** Öffnet die Dateiauswahl für den ausgewählten Rahmen; false ohne Rahmen. */
  insertFrameImage: () => boolean;
  editText: () => void;
  /** Dreht die Einzelauswahl auf `deg`; die Mitte bleibt stehen. */
  setRotation: (deg: number) => void;
  /** Nur die Anzeige: dreht den Knoten der Einzelauswahl, ohne Zustand und Verlauf. */
  previewRotation: (deg: number) => void;
  /**
   * Schreibt eine offene Vorschau fest — dem Element, das sie zeigt, auch wenn
   * die Auswahl inzwischen eine andere ist. Ohne Vorschau: nichts.
   */
  commitRotationPreview: () => void;
  /** Spiegelt die Auswahl; mehrere Elemente auch an der Mitte der Auswahl. */
  flip: (axis: 'x' | 'y') => void;
  run: (id: PageCommandId, at: ClientPoint | null) => void;
}

interface OrientTarget {
  door: OrientationDoor;
  node: Konva.Node;
  frame: NodeFrame;
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

  const toggleLock = () => {
    const ids = lockableIds(selection(), ctx.getRenderList());
    if (ids.length === 0) return;
    const state = ctx.getState();
    const next = { ...state, lockedLayerIds: toggledLocks(lockedIdsOf(state), ids) };
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

  const doorInput = (): OrientationDoorInput<TState> => ({
    state: ctx.getState(),
    actions: ctx.getActions(),
    elements: ctx.getElements(),
    layout: ctx.getLayout(),
    updateState: (fn) => ctx.setState(fn),
    saveToHistory: ctx.saveToHistory,
  });

  const orient = (id: string) => (ctx.isReadOnly() ? null : findOrientationDoor(doorInput(), id));

  /** Tür und Knoten je drehbarem Element der Auswahl; gesperrte fallen heraus. */
  const orientTargets = (ids: readonly string[]): OrientTarget[] => {
    const layer = ctx.getStage()?.getLayers()[0];
    if (ctx.isReadOnly() || !layer) return [];
    const input = doorInput();
    return ids.flatMap((id) => {
      const door = findOrientationDoor(input, id);
      const node = door ? findDragNodes(layer, [id])[0] : undefined;
      return door && node ? [{ door, node, frame: readNodeFrame(node) }] : [];
    });
  };

  /** Mehrere Elemente sind ein Schritt im Verlauf. */
  const writeAll = (writes: readonly (() => void)[]) => {
    if (writes.length === 1) writes[0]!();
    else if (writes.length > 1) ctx.runHistoryBatch(() => writes.forEach((write) => write()));
  };

  const rotateTo = (ids: readonly string[], deg: number) => {
    preview = null;
    const rotation = normalizeRotation(deg);
    writeAll(
      orientTargets(ids).map(({ door, frame }) => () => {
        door.apply({ ...placeKeepingCentre(frame, { rotation }), rotation });
      })
    );
  };

  /**
   * Ziel der laufenden Vorschau, beim ersten Bild gemerkt: die weiteren Bilder
   * suchen weder Tür noch Knoten neu und messen nicht nochmal. Gilt für genau
   * diese Auswahl (Array-Identität aus dem Store) und endet mit dem Abschluss.
   * `deg` ist das zuletzt gezeigte Bild.
   */
  let preview: {
    ids: readonly string[];
    target: OrientTarget;
    layer: Konva.Layer;
    deg: number;
  } | null = null;

  const setRotation = (deg: number) => {
    preview = null;
    const ids = selection();
    if (ids.length === 1) rotateTo(ids, deg);
  };

  const previewRotation = (deg: number) => {
    const ids = selection();
    if (preview?.ids !== ids) {
      preview = null;
      const layer = ctx.getStage()?.getLayers()[0];
      const [target] = ids.length === 1 && layer ? orientTargets(ids) : [];
      if (!target || !layer) return;
      preview = { ids, target, layer, deg: target.frame.rotation };
    }
    const { target, layer } = preview;
    const rotation = normalizeRotation(deg);
    preview.deg = rotation;
    // Der Balken dreht um seinen Offset; seine Tür nimmt x/y nicht an.
    if (target.door.kind !== 'balken') {
      target.node.position(placeKeepingCentre(target.frame, { rotation }));
    }
    target.node.rotation(rotation);
    layer.batchDraw();
  };

  /**
   * Abgebrochener Zug (Popover zu, Leiste weg): die Vorschau gehört zu ihren
   * Ids, nicht zur Auswahl von jetzt. Lässt sich das Element nicht mehr drehen
   * (entfernt, inzwischen gesperrt), springt ein noch vorhandener Knoten auf
   * den Zustand zurück, statt gedreht stehen zu bleiben.
   */
  const commitRotationPreview = () => {
    const pending = preview;
    preview = null;
    if (!pending) return;
    if (orientTargets(pending.ids).length > 0) {
      rotateTo(pending.ids, pending.deg);
      return;
    }
    const { node, frame } = pending.target;
    if (!node.getParent()) return;
    node.position({ x: frame.x, y: frame.y });
    node.rotation(frame.rotation);
    pending.layer.batchDraw();
  };

  /**
   * Spiegeln: Drehung wird −θ, spiegelbare Kinds kippen `flipX`/`flipY`, die
   * Mitte bleibt. Der Rahmen spiegelt mit: bei Formen wechselt die Knoten-Skala
   * das Vorzeichen, Icon, Illustration und Asset spiegeln ihr Bild-Kind um den
   * Drehpunkt, das Nutzerbild per Pixelfilter. Mehrere Elemente spiegeln ihre
   * Mitten zusätzlich an der Mitte der Auswahl; Text wandert, bleibt aber lesbar.
   */
  const flip = (axis: 'x' | 'y') => {
    preview = null;
    const targets = orientTargets(selection());
    if (targets.length === 0 || (targets.length === 1 && !targets[0]!.door.canFlip)) return;
    let mid: number | null = null;
    if (targets.length > 1) {
      const boxes = targets.map((t) => axisAlignedBounds(t.frame));
      const lo = Math.min(...boxes.map((b) => (axis === 'x' ? b.x : b.y)));
      const hi = Math.max(...boxes.map((b) => (axis === 'x' ? b.x + b.width : b.y + b.height)));
      mid = (lo + hi) / 2;
    }
    writeAll(
      targets.map(({ door, frame }) => {
        const rotation = normalizeRotation(-door.rotation);
        const scaleFlips = door.canFlip && door.kind !== 'user-image';
        const pos = placeKeepingCentre(frame, {
          rotation,
          scaleX: axis === 'x' && scaleFlips ? -frame.scaleX : frame.scaleX,
          scaleY: axis === 'y' && scaleFlips ? -frame.scaleY : frame.scaleY,
        });
        if (mid !== null) {
          const centre = centreOf(frame);
          if (axis === 'x') pos.x += 2 * (mid - centre.x);
          else pos.y += 2 * (mid - centre.y);
        }
        // Kinds ohne x/y (Balken) verschieben um dieselbe Strecke.
        const translate = { x: pos.x - frame.x, y: pos.y - frame.y };
        const patch: OrientationPatch = { ...pos, rotation, translate };
        if (door.canFlip && axis === 'x') patch.flipX = !door.flipX;
        if (door.canFlip && axis === 'y') patch.flipY = !door.flipY;
        return () => door.apply(patch);
      })
    );
  };

  const commands: Omit<CanvasCommands, 'run'> = {
    capabilities: () =>
      selectionCapabilities({
        ids: selection(),
        state: ctx.getState(),
        actions: ctx.getActions(),
        template: ctx.template,
        renderList: ctx.getRenderList(),
        orient,
        readOnly: ctx.isReadOnly(),
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
    toggleLock,
    insertFrameImage,
    editText,
    setRotation,
    previewRotation,
    commitRotationPreview,
    flip,
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
        return toggleLock();
      case 'editText':
        return editText();
      case 'insertFrameImage':
        insertFrameImage();
        return;
      case 'flipHorizontal':
        return flip('x');
      case 'flipVertical':
        return flip('y');
      case 'resetRotation':
        return rotateTo(selection(), 0);
    }
  };

  return { ...commands, run };
}
