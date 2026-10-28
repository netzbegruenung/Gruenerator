/**
 * Balken — the data of a bar group on the canvas: one or three skewed bars
 * with a text each. The Grünerator's own element kind: registered with the
 * editor in `brand/balkenKind.ts`, drawn by `brand/grueneKinds.tsx`, its
 * presets in `brand/balkenPresets.ts`.
 */

import type { ElementPlacement } from '@ggraphic/editor/utils/userImageUtils';

export type BalkenMode = 'single' | 'triple';

export interface BalkenInstance {
  id: string;
  mode: BalkenMode;
  colorSchemeId: string;
  widthScale: number;
  offset: { x: number; y: number };
  scale: number;
  texts: string[];
  rotation: number;
  opacity?: number;
  barOffsets?: [number, number, number];
}

// The actions ride on every config's actions object, next to the core's.
declare module '@ggraphic/editor/hooks/useCanvasElementHandlers' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface HostCanvasActions extends BalkenActions {}
}

// The kind's type side: `balkenInstances` (F0, stored in canvases and
// templates) holds the instances; a tile adds one by its `mode`.
declare module '@ggraphic/editor/utils/canvasItem' {
  interface HostElementKinds {
    balken: { stateKey: 'balkenInstances'; data: BalkenInstance; payload: { mode: BalkenMode } };
  }
}

/** The config actions of the Balken (`configs/factory/balkenActions.ts`); F0 names. */
export interface BalkenActions {
  addBalken?: (mode: BalkenMode, options?: ElementPlacement) => void;
  updateBalken?: (id: string, partial: Partial<BalkenInstance>) => void;
  setBalkenText?: (id: string, index: number, text: string) => void;
  removeBalken?: (id: string) => void;
  duplicateBalken?: (id: string) => void;
}
