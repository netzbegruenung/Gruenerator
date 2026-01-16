/**
 * Zustand Stores - Centralized Export
 * Clean imports for all stores and related hooks
 */

// Middlewares (for future store implementations)
export { localStorageMiddleware, loadFromLocalStorage } from './middlewares/localStorageMiddleware';
export { apiCheckMiddleware, createApiValidationConfig } from './middlewares/apiCheckMiddleware';
export { crossTabSyncMiddleware, createCrossTabSyncConfig } from './middlewares/crossTabSyncMiddleware';

// Test Components
// export { default as BetaFeaturesMigrationTest } from '../components/test/BetaFeaturesMigrationTest'; // Component not found

// Active stores:
export { default as useGeneratedTextStore } from './core/generatedTextStore';
export { default as useFormStateStore } from './core/formStateStore';
export { default as useTextEditActions } from './hooks/useTextEditActions';

// Canvas Editor
export {
  useCanvasEditorStore,
  useCanvasLayers,
  useCanvasSelection,
  useCanvasConfig,
  useCanvasContainerSize,
  useRenderVersion,
  useSnapGuides,
  useSnapLines,
  useCanvasHistory,
} from './canvasEditorStore';
export { canvasRefRegistry, CanvasRefRegistry } from './canvasEditorRefs';

