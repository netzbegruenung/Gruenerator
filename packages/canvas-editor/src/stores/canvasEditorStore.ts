/**
 * canvasEditorStore — Backward-compatible re-export barrel
 *
 * The store implementation has moved to createCanvasEditorStore.ts (factory)
 * and CanvasStoreProvider.tsx (React context + hooks).
 *
 * This file re-exports everything so existing imports continue to work.
 * New code should import from CanvasStoreProvider directly.
 */

// Re-export types from the factory
export type {
  CanvasEditorState,
  CanvasEditorActions,
  CanvasEditorGetters,
  CanvasEditorStoreState,
  CanvasEditorStoreApi,
} from './createCanvasEditorStore';

// Re-export factory and default singleton
export {
  createCanvasEditorStore,
  defaultCanvasEditorStore,
} from './createCanvasEditorStore';

// Re-export context-aware hooks (these are the primary API)
export {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreSelector,
  useCanvasStoreShallow,
  useIsElementSelected,
} from './CanvasStoreProvider';

// =============================================================================
// BACKWARD-COMPATIBLE SELECTOR HOOKS
//
// These hooks use the context-aware store, so they work both:
// - Inside a CanvasStoreProvider (scoped to that instance)
// - Outside any provider (falls back to default singleton)
// =============================================================================

import { useCanvasStoreSelector, useCanvasStoreShallow } from './CanvasStoreProvider';
import type { CanvasEditorState } from './createCanvasEditorStore';
import type { SnapTarget, SnapLine } from '../utils/snapping';
import type { Layer } from '@gruenerator/shared/canvas-editor';

export const useCanvasLayers = (): Layer[] =>
  useCanvasStoreShallow((s) => s.layers);

export const useCanvasSelection = (): string[] =>
  useCanvasStoreShallow((s) => s.selectedLayerIds);

export const useCanvasConfig = (): CanvasEditorState['config'] =>
  useCanvasStoreShallow((s) => s.config);

export const useCanvasContainerSize = (): { width: number; height: number } =>
  useCanvasStoreShallow((s) => s.containerSize);

export const useRenderVersion = (): number =>
  useCanvasStoreSelector((s) => s.renderVersion);

export const useSnapGuides = (): { h: boolean; v: boolean } =>
  useCanvasStoreShallow((s) => s.snapGuides);

export const useSnapLines = (): SnapLine[] =>
  useCanvasStoreShallow((s) => s.snapLines);

export const useElementPositions = (): Record<string, SnapTarget> =>
  useCanvasStoreShallow((s) => s.elementPositions);

export const useCanvasHistory = (): { canUndo: boolean; canRedo: boolean } =>
  useCanvasStoreShallow((s) => ({
    canUndo: s.historyIndex > 0,
    canRedo: s.historyIndex < s.history.length - 1,
  }));

// Legacy default export — prefer named imports
export { defaultCanvasEditorStore as default } from './createCanvasEditorStore';
