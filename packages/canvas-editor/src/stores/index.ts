// Context-aware selector hooks (primary API)
export {
  useCanvasLayers,
  useCanvasSelection,
  useCanvasConfig,
  useCanvasContainerSize,
  useRenderVersion,
  useCanvasHistory,
  useElementPositions,
  useSnapGuides,
  useSnapLines,
} from './canvasEditorStore';

// Store factory and provider
export { createCanvasEditorStore, defaultCanvasEditorStore } from './createCanvasEditorStore';
export type {
  CanvasEditorStoreApi,
  CanvasEditorStoreState,
  CanvasEditorState,
  CanvasEditorActions,
} from './createCanvasEditorStore';

export {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreSelector,
  useCanvasStoreShallow,
  useIsElementSelected,
} from './CanvasStoreProvider';

// Ref registry
export { canvasRefRegistry } from './canvasEditorRefs';

// Auto-save store
export {
  AutoSaveStoreProvider,
  useAutoSaveStore,
  useAutoSaveStoreApi,
  useAutoSaveStoreShallow,
} from './useAutoSaveStore';
export type {
  AutoSaveStore,
  AutoSaveStoreApi,
  AutoSaveState,
  AutoSaveActions,
  AutoSaveStatus,
} from './useAutoSaveStore';
