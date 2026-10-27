// SPDX-License-Identifier: MPL-2.0
export { useElementSnapping } from '@ggraphic/editor/hooks/useElementSnapping';
export type { UseElementSnappingResult } from '@ggraphic/editor/hooks/useElementSnapping';
export { useCanvasUndoRedo } from '@ggraphic/editor/hooks/useCanvasUndoRedo';

export { useCanvasInteractions } from './useCanvasInteractions';
export type {
  UseCanvasInteractionsOptions,
  UseCanvasInteractionsResult,
} from './useCanvasInteractions';

export { useCanvasStoreReset } from '@ggraphic/editor/hooks/useCanvasStoreReset';

export { useCanvasHistorySetup } from '@ggraphic/editor/hooks/useCanvasHistorySetup';
export type { UseCanvasHistorySetupResult } from '@ggraphic/editor/hooks/useCanvasHistorySetup';

export { useImageCoverFit } from '@ggraphic/editor/hooks/useImageCoverFit';
export type { CoverFitDimensions } from '@ggraphic/editor/hooks/useImageCoverFit';

export { useFloatingModuleState } from './useFloatingModuleState';
export type { FloatingModuleState, UseFloatingModuleStateOptions } from './useFloatingModuleState';

export { useFloatingModuleHandlers } from './useFloatingModuleHandlers';
export type {
  UseFloatingModuleHandlersOptions,
  UseFloatingModuleHandlersResult,
} from './useFloatingModuleHandlers';

export { useCanvasElementHandlers } from './useCanvasElementHandlers';
export type {
  UseCanvasElementHandlersOptions,
  UseCanvasElementHandlersResult,
} from './useCanvasElementHandlers';

export { useCanvasKeyboardHandlers } from './useCanvasKeyboardHandlers';
export type { UseCanvasKeyboardHandlersOptions } from './useCanvasKeyboardHandlers';

export { useFontGeneration } from '@ggraphic/editor/hooks/useFontGeneration';
export { useFontLoader } from '@ggraphic/editor/hooks/useFontLoader';
export type {
  UseFontLoaderOptions,
  UseFontLoaderResult,
} from '@ggraphic/editor/hooks/useFontLoader';

export { usePaginatedIcons } from '@ggraphic/editor/hooks/usePaginatedIcons';

export { useMultiPageExport } from './useMultiPageExport';
export type {
  UseMultiPageExportProps,
  UseMultiPageExportReturn,
  ExportProgress,
} from './useMultiPageExport';

export { usePageManager, parseInitialPages } from './usePageManager';
export { useDeckAutoSave, SHARE_ORIGINAL_IMAGE_SRC } from './useDeckAutoSave';
export type { InitialPageDef, UsePageManagerOptions, UsePageManagerReturn } from './usePageManager';

export { usePageThumbnails } from './usePageThumbnails';

export { useMobileSheet } from '@ggraphic/editor/hooks/useMobileSheet';
