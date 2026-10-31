// SPDX-License-Identifier: MPL-2.0
/**
 * Die Türen der Befehle einer Seite: Kopieren, Einfügen, Duplizieren, Löschen,
 * Ebenen, Alles auswählen. Tastatur, Kontextleiste, Pille und Kontextmenü
 * rufen dieselbe Funktion — vorher war jede Aktion je Oberfläche von Hand
 * verdrahtet, und Strg+C kannte keine Mehrfachauswahl, während Entf sie kannte.
 *
 * Gelesen wird beim Aufruf: Auswahl aus dem Store, Zustand als der committete.
 * Eine Mehrfach-Aktion ist ein Schritt im Verlauf.
 */

import { messages } from '@ggraphic/editor/i18n/messages';
import {
  alignDelta,
  distributeDeltas,
  unionBox,
  type AlignDirection,
  type Delta,
} from '@ggraphic/editor/utils/alignment';
import { itemBodyRect } from '@ggraphic/editor/utils/deepSelect';
import { locateDrop } from '@ggraphic/editor/utils/mediaDrop';
import { findDragNodes, selectableItemIds } from '@ggraphic/editor/utils/multiSelect';
import {
  axisAlignedBounds,
  centreOf,
  normalizeRotation,
  placeKeepingCentre,
  readNodeFrame,
  type Box,
  type NodeFrame,
} from '@ggraphic/editor/utils/orientation';
import { openTextEditor } from '@ggraphic/editor/utils/textEditorOpeners';

import { CanvasClipboard } from './canvasClipboard.js';
import { moveLayerTo, type CanvasItem, type LayerStep } from './canvasLayerManager.js';
import {
  DUPLICATE_OFFSET,
  duplicateElementInState,
  findDuplicableEntry,
  insertInstance,
  type DuplicableEntry,
  type InsertOffset,
  type TemplateEntryLookup,
} from './duplicateElement.js';
import { layerLabel } from './layerLabels.js';
import { lockedIdsOf, toggledLocks } from './layerLock.js';
import {
  findOrientationDoor,
  type OrientableKind,
  type OrientationDoor,
  type OrientationDoorInput,
  type OrientationPatch,
} from './orientElement.js';
import { findElementRemover, isTemplateBound } from './removeElement.js';
import {
  lockableIds,
  selectionCapabilities,
  type SelectionCapabilities,
} from './selectionCapabilities.js';

import type { BaseCanvasState } from '../configs/factory/baseTypes.js';
import type { CanvasElementConfig, LayoutResult } from '../configs/types.js';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers.js';
import type { CanvasEditorStoreApi } from '@ggraphic/editor/stores/createCanvasEditorStore';
import type { PageCommandId } from '@ggraphic/editor/utils/canvasCommandRegistry';
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
  /** Lesemodus: Drehen & Spiegeln, Ausrichten und Position tun nichts. */
  isReadOnly: () => boolean;
  /** Die Seite in logischen px (Vorlagengröße) — Ziel beim Ausrichten eines einzelnen Elements. */
  getPageSize: () => { width: number; height: number };
  /** Sagt Screenreadern einen Satz an (`useAnnounce`); ohne Angabe bleiben die Befehle stumm. */
  announce?: (text: string) => void;
}

/**
 * Wie „B“/„H“ ein Element ändern: `width` nur die Breite (Text — die Höhe
 * folgt dem Umbruch), `free` beide (Formen), `uniform` beide im Seitenverhältnis.
 */
export type ResizeMode = 'width' | 'free' | 'uniform';

/** Lage und Größe der Einzelauswahl für das Positionsfeld, in logischen px. */
export interface SelectionGeometry {
  /** Linke obere Ecke des gedrehten Umrisses — dieselbe Kante, an der „Links“ ausrichtet. */
  x: number;
  y: number;
  /** Die eigene, ungedrehte Größe. */
  width: number;
  height: number;
  resize: ResizeMode | null;
}

/**
 * Die Größe schreibt der Abschluss des Primitivs selbst (`transformend`), wie
 * nach einem Zug am Griff — hier steht nur, wie der Zug auf dem Knoten aussieht.
 * Ohne Eintrag kein „B“/„H“: eine Host-Art rechnet beim Abschluss ihre Mitte neu,
 * Rahmen und Vorlagen-Bilder zoomen ihr Foto bzw. verwerfen Änderungen unter 3 %.
 */
const RESIZE_MODES: Partial<Record<OrientableKind, ResizeMode>> = {
  text: 'width',
  'template-text': 'width',
  shape: 'free',
  icon: 'uniform',
  illustration: 'uniform',
  asset: 'uniform',
  'user-image': 'uniform',
  chart: 'uniform',
  'pill-badge': 'uniform',
  'circle-badge': 'uniform',
};

const LAYER_STEP_MESSAGES: Readonly<
  Record<LayerStep, 'layerFront' | 'layerForward' | 'layerBackward' | 'layerBack'>
> = {
  front: 'layerFront',
  forward: 'layerForward',
  backward: 'layerBackward',
  back: 'layerBack',
};

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
  /**
   * Dreht ein Element unabhängig von der Auswahl auf `deg`, um die Mitte — die
   * Tür der KI. `false`, wenn es sich nicht drehen lässt.
   */
  rotateElement: (id: string, deg: number) => boolean;
  /** Spiegelt die Auswahl; mehrere Elemente auch an der Mitte der Auswahl. */
  flip: (axis: 'x' | 'y') => void;
  /** Einzeln an der Seite, mehrere am Umriss der Auswahl; gesperrte bleiben stehen. */
  align: (dir: AlignDirection) => void;
  /** Gleiche Abstände zwischen mindestens drei beweglichen Elementen. */
  distribute: (axis: 'x' | 'y') => void;
  /** `null` ohne bewegliche Einzelauswahl. */
  geometry: () => SelectionGeometry | null;
  setPosition: (patch: { x?: number; y?: number }) => void;
  setSize: (patch: { width?: number; height?: number }) => void;
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

  /** „Text: Klimaschutz“ bei einem Element, „3 Elemente“ bei mehreren; null ohne Treffer. */
  const describe = (ids: readonly string[]): string | null => {
    if (ids.length === 0) return null;
    if (ids.length > 1) return messages().common.elements(ids.length);
    const item = ctx.getRenderList().find((entry) => entry.id === ids[0]);
    return item ? layerLabel(item, ctx.getState()) : messages().common.element;
  };
  /** `verb` steht hinter mehreren Elementen, `lead` vor einem einzelnen: „Gelöscht: Text“ / „3 Elemente gelöscht“. */
  const say = (ids: readonly string[], lead: string, verb: string) => {
    const what = describe(ids);
    if (!what) return;
    const m = messages().announce;
    ctx.announce?.(ids.length === 1 ? m.leadWhat(lead, what) : m.whatVerb(what, verb));
  };

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

  const copyQuietly = (): boolean => {
    const ids = selection();
    const state = ctx.getState();
    const entries = ids
      .map((id) => findDuplicableEntry(state, id, ctx.template))
      .filter((entry): entry is DuplicableEntry => entry !== null);
    if (entries.length === 0) return false;
    CanvasClipboard.copy({ entries, bounds: measure(ids) });
    return true;
  };

  const copy = () => {
    if (copyQuietly()) say(selection(), messages().announce.copied, messages().announce.copiedMany);
  };

  /** Löscht die Auswahl; false, wenn nichts davon entfernbar war. `lead`/`verb` wählen die Ansage. */
  const removeSelection = (lead: string, verb: string): boolean => {
    const state = ctx.getState();
    const actions = ctx.getActions();
    const removable = selection().flatMap((id) => {
      const remove = findElementRemover(state, actions, id);
      return remove ? [{ id, remove }] : [];
    });
    if (removable.length === 0) return false;
    // Nur was wirklich geht, wird angesagt: ein Vorlagen-Element in der
    // Auswahl bleibt stehen und zählt nicht mit. Vor dem Löschen benannt,
    // danach fehlt der Eintrag in der Render-Liste.
    const removedIds = removable.map((entry) => entry.id);
    const label = describe(removedIds);
    if (removable.length === 1) removable[0]!.remove();
    else ctx.runHistoryBatch(() => removable.forEach((entry) => entry.remove()));
    ctx.store.getState().setSelectedElement(null);
    if (label) {
      const m = messages().announce;
      ctx.announce?.(removedIds.length === 1 ? m.leadWhat(lead, label) : m.whatVerb(label, verb));
    }
    return true;
  };

  /**
   * Entf ohne Wirkung, weil die Auswahl zur Vorlage gehört, sagt das einmal an.
   * Gesperrtes bleibt still stehen — das Schloss sagt schon, warum.
   */
  const remove = () => {
    if (removeSelection(messages().announce.deleted, messages().announce.deletedMany)) return;
    const state = ctx.getState();
    const actions = ctx.getActions();
    const renderList = ctx.getRenderList();
    const bound = selection().filter((id) => isTemplateBound(state, actions, renderList, id));
    const what = describe(bound);
    if (!what) return;
    ctx.announce?.(
      bound.length === 1
        ? messages().announce.templateBound(what)
        : messages().announce.templateBoundMany(what)
    );
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
    ctx.announce?.(
      newIds.length === 1
        ? messages().announce.pasted
        : messages().announce.pastedMany(newIds.length)
    );
  };

  const duplicate = () => {
    let next = ctx.getState();
    const newIds: string[] = [];
    const sourceIds = selection();
    const label = describe(sourceIds);
    for (const id of sourceIds) {
      const result = duplicateElementInState(next, id, { template: ctx.template });
      if (!result) continue;
      next = result.state;
      newIds.push(result.newId);
    }
    if (newIds.length === 0) return;
    commit(next, newIds);
    if (label) {
      ctx.announce?.(
        newIds.length === 1
          ? messages().announce.duplicated(label)
          : messages().announce.duplicatedMany(newIds.length)
      );
    }
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
    ctx.announce?.(messages().announce[LAYER_STEP_MESSAGES[step]]);
  };

  const toggleLock = () => {
    const ids = lockableIds(selection(), ctx.getRenderList());
    if (ids.length === 0) return;
    const state = ctx.getState();
    const next = { ...state, lockedLayerIds: toggledLocks(lockedIdsOf(state), ids) };
    const label = describe(ids);
    ctx.setState(next);
    ctx.saveToHistory(next);
    if (!label) return;
    const locked = lockedIdsOf(next);
    const nowLocked = ids.every((id) => locked.includes(id));
    if (ids.length === 1) {
      // Der Name trägt „, gesperrt“ schon, wenn er vor dem Umschalten gelesen wurde.
      const m = messages();
      ctx.announce?.(
        m.announce.leadWhat(
          nowLocked ? m.announce.locked : m.announce.unlocked,
          label.replace(m.layers.lockedSuffix, '')
        )
      );
    } else {
      const m = messages().announce;
      ctx.announce?.(m.whatVerb(label, nowLocked ? m.lockedMany : m.unlockedMany));
    }
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

  /**
   * Host-Arten, Pille und Störer melden ihren Editor (`textEditorOpeners`); ein
   * Text-Knoten öffnet ihn selbst auf den Doppelklick, den die Tür auslöst.
   */
  const editText = () => {
    const id = ctx.store.getState().selectedElement;
    if (!id || openTextEditor(ctx.store, id)) return;
    ctx.getStage()?.findOne(`#${id}`)?.fire('dblclick', {}, false);
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
      const node = door ? (findDragNodes(layer, [id])[0] ?? null) : null;
      return door && node ? [{ door, node, frame: readNodeFrame(node) }] : [];
    });
  };

  /** Mehrere Elemente sind ein Schritt im Verlauf. */
  const writeAll = (writes: readonly (() => void)[]) => {
    if (writes.length === 1) writes[0]!();
    else if (writes.length > 1) ctx.runHistoryBatch(() => writes.forEach((write) => write()));
  };

  /** Anzahl der gedrehten Elemente. */
  const rotateTo = (ids: readonly string[], deg: number): number => {
    const rotation = normalizeRotation(deg);
    const targets = orientTargets(ids);
    writeAll(
      targets.map(({ door, frame }) => () => {
        door.apply({ ...placeKeepingCentre(frame, { rotation }), rotation });
      })
    );
    return targets.length;
  };

  /**
   * Spiegeln: Drehung wird −θ, spiegelbare Kinds kippen `flipX`/`flipY`, die
   * Mitte bleibt. Der Rahmen spiegelt mit: bei Formen wechselt die Knoten-Skala
   * das Vorzeichen, Icon, Illustration und Asset spiegeln ihr Bild-Kind um den
   * Drehpunkt, das Nutzerbild per Pixelfilter. Mehrere Elemente spiegeln ihre
   * Mitten zusätzlich an der Mitte der Auswahl; Text wandert, bleibt aber lesbar.
   */
  const flip = (axis: 'x' | 'y') => {
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
        // Kinds ohne x/y (Host-Arten mit Versatz) verschieben um dieselbe Strecke.
        const translate = { x: pos.x - frame.x, y: pos.y - frame.y };
        const patch: OrientationPatch = { ...pos, rotation, translate };
        if (door.canFlip && axis === 'x') patch.flipX = !door.flipX;
        if (door.canFlip && axis === 'y') patch.flipY = !door.flipY;
        return () => door.apply(patch);
      })
    );
  };

  const boundsOf = (target: OrientTarget): Box => axisAlignedBounds(target.frame);

  /** Kinds ohne x/y (Host-Arten mit Versatz) lesen `translate`, alle anderen x/y. */
  const moveBy =
    ({ door, frame }: OrientTarget, d: Delta) =>
    () =>
      door.apply({ x: frame.x + d.x, y: frame.y + d.y, translate: d });

  const moves = (d: Delta) => Math.abs(d.x) > 1e-9 || Math.abs(d.y) > 1e-9;

  /** Der Umriss aller ausgewählten Elemente — gesperrte eingeschlossen, sie bleiben nur stehen. */
  const selectionBounds = (ids: readonly string[]): Box | null => {
    const layer = ctx.getStage()?.getLayers()[0];
    if (!layer) return null;
    const boxes = ids.flatMap((id) => {
      const node = findDragNodes(layer, [id])[0];
      return node ? [axisAlignedBounds(readNodeFrame(node))] : [];
    });
    return boxes.length > 0 ? unionBox(boxes) : null;
  };

  const align = (dir: AlignDirection) => {
    const ids = selection();
    const targets = orientTargets(ids);
    if (targets.length === 0) return;
    const reference =
      ids.length === 1 ? { x: 0, y: 0, ...ctx.getPageSize() } : selectionBounds(ids);
    if (!reference) return;
    writeAll(
      targets.flatMap((t) => {
        const d = alignDelta(boundsOf(t), reference, dir);
        return moves(d) ? [moveBy(t, d)] : [];
      })
    );
  };

  const distribute = (axis: 'x' | 'y') => {
    const targets = orientTargets(selection());
    const deltas = distributeDeltas(targets.map(boundsOf), axis);
    writeAll(targets.flatMap((t, i) => (moves(deltas[i]!) ? [moveBy(t, deltas[i]!)] : [])));
  };

  const singleTarget = (): OrientTarget | null => {
    const ids = selection();
    return ids.length === 1 ? (orientTargets(ids)[0] ?? null) : null;
  };

  const ownSize = ({ frame }: OrientTarget) => ({
    width: frame.local.width * Math.abs(frame.scaleX),
    height: frame.local.height * Math.abs(frame.scaleY),
  });

  const geometry = (): SelectionGeometry | null => {
    const target = singleTarget();
    if (!target) return null;
    const box = boundsOf(target);
    return {
      x: box.x,
      y: box.y,
      ...ownSize(target),
      resize: RESIZE_MODES[target.door.kind] ?? null,
    };
  };

  const setPosition = (patch: { x?: number; y?: number }) => {
    const target = singleTarget();
    if (!target) return;
    const box = boundsOf(target);
    const d = {
      x: patch.x != null ? patch.x - box.x : 0,
      y: patch.y != null ? patch.y - box.y : 0,
    };
    if (moves(d)) moveBy(target, d)();
  };

  const setSize = (patch: { width?: number; height?: number }) => {
    const target = singleTarget();
    const mode = target ? RESIZE_MODES[target.door.kind] : undefined;
    if (!target || !mode) return;
    const valid = (n: number | undefined): n is number => n != null && Number.isFinite(n) && n >= 1;
    const size = ownSize(target);
    const { node, frame } = target;
    if (mode === 'width') {
      if (!valid(patch.width)) return;
      node.width(patch.width / Math.abs(frame.scaleX));
    } else {
      const kx = valid(patch.width) ? patch.width / size.width : null;
      const ky = valid(patch.height) ? patch.height / size.height : null;
      if (kx === null && ky === null) return;
      const uniform = kx ?? ky!;
      const k = mode === 'uniform' ? { x: uniform, y: uniform } : { x: kx ?? 1, y: ky ?? 1 };
      node.scale({ x: frame.scaleX * k.x, y: frame.scaleY * k.y });
    }
    // Derselbe Abschluss wie nach einem Zug am Griff: das Primitiv schreibt Größe und Verlauf.
    node.fire('transformend');
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
      copyQuietly();
      removeSelection(messages().announce.cut, messages().announce.cutMany);
    },
    paste,
    duplicate,
    remove,
    selectAll,
    moveLayer,
    toggleLock,
    insertFrameImage,
    editText,
    rotateElement: (id, deg) => rotateTo([id], deg) > 0,
    flip,
    align,
    distribute,
    geometry,
    setPosition,
    setSize,
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
        rotateTo(selection(), 0);
        return;
      case 'alignLeft':
        return align('left');
      case 'alignCenterH':
        return align('center-h');
      case 'alignRight':
        return align('right');
      case 'alignTop':
        return align('top');
      case 'alignMiddle':
        return align('center-v');
      case 'alignBottom':
        return align('bottom');
      case 'distributeHorizontal':
        return distribute('x');
      case 'distributeVertical':
        return distribute('y');
    }
  };

  return { ...commands, run };
}
