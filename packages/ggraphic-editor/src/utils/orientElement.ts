// SPDX-License-Identifier: MPL-2.0
import { findKindItem, type ElementKindName, type KindItem } from './elementKinds.js';
import { isLayerLocked } from './layerLock.js';
import {
  isTemplateElementRotatable,
  templatePositionUpdates,
  templateRotationOf,
  withTemplateRotation,
} from './templateRotation.js';

import type { BaseCanvasState } from '../configs/factory/baseTypes.js';
import type { CanvasElementConfig, LayoutResult } from '../configs/types.js';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers.js';

export type OrientableKind =
  | 'shape'
  | 'frame'
  | 'chart'
  | 'icon'
  | 'illustration'
  | 'asset'
  | 'circle-badge'
  | 'pill-badge'
  | 'balken'
  | 'user-image'
  | 'text'
  | 'template-text'
  | 'template-image';

/** Text-tragende Kinds bleiben lesbar, Vorlagen-Bilder sind CI-Marken: nie spiegeln. */
export const FLIPPABLE_KINDS: ReadonlySet<OrientableKind> = new Set<OrientableKind>([
  'shape',
  'icon',
  'illustration',
  'asset',
  'user-image',
]);

export interface OrientationPatch {
  x?: number;
  y?: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  /**
   * Verschiebung um (dx, dy) — für Kinds, deren Lage nicht in x/y steht. Nur der
   * Balken liest sie (als Zuwachs auf `offset`); alle anderen nehmen x/y.
   */
  translate?: { x: number; y: number };
}

export interface OrientationDoor {
  kind: OrientableKind;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  canFlip: boolean;
  apply: (patch: OrientationPatch) => void;
}

export interface OrientationDoorInput<TState extends Partial<BaseCanvasState>> {
  state: TState;
  actions: OptionalCanvasActions;
  elements: readonly CanvasElementConfig[];
  layout: LayoutResult;
  updateState: (fn: (prev: TState) => TState) => void;
  saveToHistory: (s: TState) => void;
}

type Oriented = { id?: string; rotation?: number; flipX?: boolean; flipY?: boolean };

type UpdateAction = Extract<keyof OptionalCanvasActions, `update${string}`>;

interface KindDoor<I extends KindItem> {
  kind: OrientableKind;
  action: UpdateAction;
  /** Where rotation and flips are read; the instance itself unless given. */
  read?: (item: I, state: Partial<BaseCanvasState>) => Oriented | null;
  /** The patch the update action receives; the patch without `translate` unless given. */
  shape?: (patch: OrientationPatch, item: I) => Record<string, unknown>;
}

const withoutTranslate = ({ translate: _, ...rest }: OrientationPatch) => rest;

/** The orientation door per element kind. */
const KIND_DOORS: { [K in ElementKindName]: KindDoor<Extract<KindItem, { type: K }>> } = {
  balken: {
    kind: 'balken',
    action: 'updateBalken',
    // Dreht um die Mitte und speichert einen `offset`: x/y gehören nicht in den Patch,
    // eine Verschiebung (Spiegeln in der Mehrfachauswahl) wandert in den `offset`.
    shape: (patch, { data: balken }) => ({
      ...(patch.rotation != null && { rotation: patch.rotation }),
      ...(patch.translate && {
        offset: {
          x: balken.offset.x + patch.translate.x,
          y: balken.offset.y + patch.translate.y,
        },
      }),
    }),
  },
  // Icons stehen als blanke Id in `selectedIcons`; ihre Lage steht in `iconStates`.
  icon: {
    kind: 'icon',
    action: 'updateIcon',
    read: ({ id }, state) => state.iconStates?.[id] ?? null,
  },
  shape: { kind: 'shape', action: 'updateShape' },
  'additional-text': { kind: 'text', action: 'updateAdditionalText' },
  illustration: { kind: 'illustration', action: 'updateIllustration' },
  asset: { kind: 'asset', action: 'updateAsset' },
  'pill-badge': { kind: 'pill-badge', action: 'updatePillBadge' },
  'circle-badge': { kind: 'circle-badge', action: 'updateCircleBadge' },
  frame: { kind: 'frame', action: 'updateFrame' },
  'user-image': { kind: 'user-image', action: 'updateUserImage' },
  chart: { kind: 'chart', action: 'updateChart' },
};

/**
 * Drehen & Spiegeln eines Canvas-Elements — eine Tür für Werkzeugleiste,
 * Kontextmenü und Tastenkürzel. Instanzen zuerst (`findKindItem`), dann Vorlagen-Elemente.
 * `null`, wenn das Element nicht drehbar ist: unbekannt, gesperrt, Hintergrund,
 * Vorlagen-Element ohne Positionsschlüssel oder Config ohne passende Aktion.
 */
export function findOrientationDoor<TState extends Partial<BaseCanvasState>>(
  input: OrientationDoorInput<TState>,
  id: string | null
): OrientationDoor | null {
  const { state, actions } = input;
  if (!id || isLayerLocked(state, id)) return null;

  const found = findKindItem(state, id);
  if (found) {
    const door = KIND_DOORS[found.type] as KindDoor<KindItem>;
    const update = actions[door.action] as ((id: string, patch: object) => void) | undefined;
    if (!update) return null;
    const item = door.read ? door.read(found, state) : (found as { data: Oriented }).data;
    return {
      kind: door.kind,
      rotation: item?.rotation ?? 0,
      flipX: item?.flipX ?? false,
      flipY: item?.flipY ?? false,
      canFlip: FLIPPABLE_KINDS.has(door.kind),
      apply: (patch) => update(id, (door.shape ?? withoutTranslate)(patch, found)),
    };
  }

  const config = input.elements.find((e) => e.id === id);
  if (!config || (config.type !== 'text' && config.type !== 'image')) return null;
  if (!isTemplateElementRotatable(config)) return null;
  const kind = config.type === 'text' ? 'template-text' : 'template-image';
  const record = state as Record<string, unknown>;

  return {
    kind,
    rotation: templateRotationOf(record, id),
    flipX: false,
    flipY: false,
    canFlip: false,
    apply: (patch) => {
      const positioned = patch.x != null && patch.y != null;
      const updates = positioned
        ? templatePositionUpdates(config, patch.x!, patch.y!, record, input.layout)
        : {};
      const rotation = patch.rotation;
      // Funktional: mehrere Türen in einem Stapel überschreiben einander nicht.
      input.updateState(
        (prev) =>
          ({
            ...prev,
            ...updates,
            ...(rotation != null && {
              templateRotations: withTemplateRotation(
                prev as Record<string, unknown>,
                id,
                rotation
              ),
            }),
          }) as TState
      );
      input.saveToHistory({ ...state, ...updates } as TState);
    },
  };
}
