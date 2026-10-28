// SPDX-License-Identifier: MPL-2.0
export { useElementSnapping } from '@ggraphic/editor/hooks/useElementSnapping';
export type { UseElementSnappingResult } from '@ggraphic/editor/hooks/useElementSnapping';
export { useCanvasUndoRedo } from '@ggraphic/editor/hooks/useCanvasUndoRedo';

export { useCanvasInteractions } from './useCanvasInteractions.js';
export type {
  UseCanvasInteractionsOptions,
  UseCanvasInteractionsResult,
} from './useCanvasInteractions.js';

export { useCanvasStoreReset } from '@ggraphic/editor/hooks/useCanvasStoreReset';

export { useCanvasHistorySetup } from '@ggraphic/editor/hooks/useCanvasHistorySetup';
export type { UseCanvasHistorySetupResult } from '@ggraphic/editor/hooks/useCanvasHistorySetup';

export { useImageCoverFit } from '@ggraphic/editor/hooks/useImageCoverFit';
export type { CoverFitDimensions } from '@ggraphic/editor/hooks/useImageCoverFit';

export { useFloatingModuleState } from './useFloatingModuleState.js';
export type {
  FloatingModuleState,
  UseFloatingModuleStateOptions,
} from './useFloatingModuleState.js';

export { useFloatingModuleHandlers } from './useFloatingModuleHandlers.js';
export type {
  UseFloatingModuleHandlersOptions,
  UseFloatingModuleHandlersResult,
} from './useFloatingModuleHandlers.js';

export { useCanvasElementHandlers } from './useCanvasElementHandlers.js';
export type {
  UseCanvasElementHandlersOptions,
  UseCanvasElementHandlersResult,
} from './useCanvasElementHandlers.js';

export { useCanvasKeyboardHandlers } from './useCanvasKeyboardHandlers.js';
export type { UseCanvasKeyboardHandlersOptions } from './useCanvasKeyboardHandlers.js';

export { useFontGeneration } from '@ggraphic/editor/hooks/useFontGeneration';
export { useFontLoader } from '@ggraphic/editor/hooks/useFontLoader';
export type {
  UseFontLoaderOptions,
  UseFontLoaderResult,
} from '@ggraphic/editor/hooks/useFontLoader';

export { usePaginatedIcons } from '@ggraphic/editor/hooks/usePaginatedIcons';

export { useMultiPageExport } from './useMultiPageExport.js';
export type {
  UseMultiPageExportProps,
  UseMultiPageExportReturn,
  ExportProgress,
} from './useMultiPageExport.js';

export { usePageManager, parseInitialPages } from './usePageManager.js';
export { useDeckAutoSave, SHARE_ORIGINAL_IMAGE_SRC } from './useDeckAutoSave.js';
export type {
  InitialPageDef,
  UsePageManagerOptions,
  UsePageManagerReturn,
} from './usePageManager.js';

export { usePageThumbnails } from './usePageThumbnails.js';

export { useMobileSheet } from '@ggraphic/editor/hooks/useMobileSheet';
