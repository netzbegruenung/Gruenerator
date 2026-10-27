// Store factory and provider
export {
  createCanvasEditorStore,
  defaultCanvasEditorStore,
} from '@ggraphic/editor/stores/createCanvasEditorStore';
export type {
  CanvasEditorStoreApi,
  CanvasEditorStoreState,
  CanvasEditorState,
  CanvasEditorActions,
} from '@ggraphic/editor/stores/createCanvasEditorStore';

export {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreSelector,
  useCanvasStoreShallow,
  useIsElementSelected,
} from '@ggraphic/editor/stores/CanvasStoreProvider';

// Auto-save store
export {
  AutoSaveStoreProvider,
  useAutoSaveStore,
  useAutoSaveStoreApi,
  useAutoSaveStoreShallow,
} from '@ggraphic/editor/stores/useAutoSaveStore';
export type {
  AutoSaveStore,
  AutoSaveStoreApi,
  AutoSaveState,
  AutoSaveActions,
  AutoSaveStatus,
} from '@ggraphic/editor/stores/useAutoSaveStore';
