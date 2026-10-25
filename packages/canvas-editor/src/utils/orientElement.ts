import { isLayerLocked } from './layerLock';
import {
  isTemplateElementRotatable,
  templatePositionUpdates,
  templateRotationOf,
  withTemplateRotation,
} from './templateRotation';

import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { CanvasElementConfig, LayoutResult } from '../configs/types';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';

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

/**
 * Drehen & Spiegeln eines Canvas-Elements — eine Tür für Werkzeugleiste,
 * Kontextmenü und Tastenkürzel. Prüfreihenfolge wie `findElementRemover`.
 * `null`, wenn das Element nicht drehbar ist: unbekannt, gesperrt, Hintergrund,
 * Vorlagen-Element ohne Positionsschlüssel oder Config ohne passende Aktion.
 */
export function findOrientationDoor<TState extends Partial<BaseCanvasState>>(
  input: OrientationDoorInput<TState>,
  id: string | null
): OrientationDoor | null {
  const { state, actions } = input;
  if (!id || isLayerLocked(state, id)) return null;

  const has = (list: readonly { id: string }[] | undefined) => !!list?.some((i) => i.id === id);
  const read = (list: readonly Oriented[] | undefined) => list?.find((i) => i.id === id) ?? null;

  const free = <P extends OrientationPatch>(
    kind: OrientableKind,
    item: Oriented | null,
    update: ((id: string, patch: P) => void) | undefined,
    shape: (patch: OrientationPatch) => Record<string, unknown> = ({ translate: _, ...rest }) =>
      rest
  ): OrientationDoor | null => {
    if (!update) return null;
    return {
      kind,
      rotation: item?.rotation ?? 0,
      flipX: item?.flipX ?? false,
      flipY: item?.flipY ?? false,
      canFlip: FLIPPABLE_KINDS.has(kind),
      apply: (patch) => update(id, shape(patch) as P),
    };
  };

  if (has(state.balkenInstances)) {
    // Dreht um die Mitte und speichert einen `offset`: x/y gehören nicht in den Patch,
    // eine Verschiebung (Spiegeln in der Mehrfachauswahl) wandert in den `offset`.
    const balken = state.balkenInstances?.find((b) => b.id === id);
    return free('balken', balken ?? null, actions.updateBalken, (patch) => ({
      ...(patch.rotation != null && { rotation: patch.rotation }),
      ...(patch.translate &&
        balken && {
          offset: {
            x: balken.offset.x + patch.translate.x,
            y: balken.offset.y + patch.translate.y,
          },
        }),
    }));
  }
  if (state.selectedIcons?.includes(id)) {
    return free('icon', state.iconStates?.[id] ?? null, actions.updateIcon);
  }
  if (has(state.shapeInstances)) {
    return free('shape', read(state.shapeInstances), actions.updateShape);
  }
  if (has(state.additionalTexts)) {
    return free('text', read(state.additionalTexts), actions.updateAdditionalText);
  }
  if (has(state.illustrationInstances)) {
    return free('illustration', read(state.illustrationInstances), actions.updateIllustration);
  }
  if (has(state.assetInstances)) {
    return free('asset', read(state.assetInstances), actions.updateAsset);
  }
  if (has(state.pillBadgeInstances)) {
    return free('pill-badge', read(state.pillBadgeInstances), actions.updatePillBadge);
  }
  if (has(state.circleBadgeInstances)) {
    return free('circle-badge', read(state.circleBadgeInstances), actions.updateCircleBadge);
  }
  if (has(state.frameInstances)) {
    return free('frame', read(state.frameInstances), actions.updateFrame);
  }
  if (has(state.userImageInstances)) {
    return free('user-image', read(state.userImageInstances), actions.updateUserImage);
  }
  if (has(state.chartInstances)) {
    return free('chart', read(state.chartInstances), actions.updateChart);
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
