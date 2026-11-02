// Store factory and provider
export {
  createCanvasEditorStore,
  defaultCanvasEditorStore,
} from '@ggraphic/editor/internal/stores/createCanvasEditorStore';
export type {
  CanvasEditorStoreApi,
  CanvasEditorStoreState,
  CanvasEditorState,
  CanvasEditorActions,
} from '@ggraphic/editor/internal/stores/createCanvasEditorStore';

export {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreSelector,
  useCanvasStoreShallow,
  useIsElementSelected,
} from '@ggraphic/editor/store';

// Auto-save store
export {
  AutoSaveStoreProvider,
  useAutoSaveStore,
  useAutoSaveStoreApi,
  useAutoSaveStoreShallow,
} from '@ggraphic/editor/store';
export type {
  AutoSaveStore,
  AutoSaveStoreApi,
  AutoSaveState,
  AutoSaveActions,
  AutoSaveStatus,
} from '@ggraphic/editor/store';
