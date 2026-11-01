import { registerHostStorageKeys } from '@ggraphic/editor/host';

import { GRUENE_KIND_RENDERERS, registerKindRenderers } from './brand/grueneKinds';

// The Grünerator's own element kinds (the Balken) draw wherever this package
// draws: every canvas the app renders, on screen or offscreen, comes through
// this entry. Installed here rather than in apps/web's startup like the asset
// catalogue, because the renderers pull Konva, which the app's first load must
// not carry. `package.json` lists this file under `sideEffects`, or the
// bundler would drop the call whenever a consumer uses only re-exports.
registerKindRenderers(GRUENE_KIND_RENDERERS);

// F0: every browser that opened the editor holds its recent elements under this key.
registerHostStorageKeys({ recentElements: 'gruenerator-canvas-recent-elements' });

export { MasterCanvasEditor } from './MasterCanvasEditor';
export { ControllableCanvasWrapper } from './CanvasEditorRouter';
export type { ControllableCanvasWrapperProps, CanvasInitialPropsMap } from './CanvasEditorRouter';
export type { CanvasEditorExportApi } from '@ggraphic/editor/embed';
export type { CanvasEditorHostChrome } from '@ggraphic/editor/shell';
export { EDITOR_KEY_SHIELD_ATTRIBUTE } from '@ggraphic/editor/shell';
export { templateFitsFormat } from './utils/templateRegistry';
export { CanvasEditorProvider } from '@ggraphic/editor/shell';
export { useCanvasEditorServices } from '@ggraphic/editor/host';
export { canvasImageSourceUrl } from '@ggraphic/editor/internal/utils/canvasImageSource';
export type { CanvasImageUrlService } from '@ggraphic/editor/services';
export type { CanvasEditorServices } from '@ggraphic/editor/host';
export type {
  ChatSectionContentProps,
  CanvasAiEditBridge,
  CanvasSpecEditBridge,
} from '@ggraphic/editor/shell';
export type { CanvasFeedbackService } from '@ggraphic/editor/services';
export type { CanvasVorlagenService, VorlagePage } from './grueneratorHostServices';

export { StandaloneCanvas } from '@ggraphic/editor/canvas';
export { ConfigCanvas } from '@ggraphic/editor/canvas';
export { commitOpenTextEdit } from '@ggraphic/editor/internal/components/CanvasTextOverlay';
export type { StandaloneCanvasProps } from '@ggraphic/editor/canvas';
export type { ConfigCanvasProps } from '@ggraphic/editor/canvas';
export { GenericCanvas } from '@ggraphic/editor/canvas';
export type { GenericCanvasProps, GenericCanvasRef } from '@ggraphic/editor/canvas';
export { defineTemplate, registerTemplates } from './templates/registry';
export type { TemplateDefinition, TemplateId, AnyCanvasConfig } from './templates/registry';

export {
  CanvasStage,
  type CanvasStageProps,
  type CanvasStageRef,
  CanvasBackground,
  type CanvasBackgroundProps,
  type GradientConfig,
  type GradientStop,
  CanvasText,
  type CanvasTextProps,
  SnapGuidelines,
  type SnapGuidelinesProps,
  CanvasImage,
  type CanvasImageProps,
  CanvasIcons,
  ShapePrimitive,
  IllustrationPrimitive,
  type IllustrationPrimitiveProps,
  CircleBadge,
  type CircleBadgeProps,
  PillBadge,
  type PillBadgeProps,
} from '@ggraphic/editor/internal/primitives/index';
export { type CircleBadgeInstance, type CircleBadgeTextLine } from '@ggraphic/editor/elements';
export { BalkenGroup } from './primitives/BalkenGroup';
export type { BalkenInstance, BalkenMode } from './utils/balkenUtils';
export type { BalkenGroupProps } from './primitives/BalkenGroup';
export * from './composed';
export * from './utils';
export {
  useElementSnapping,
  type UseElementSnappingResult,
  useCanvasUndoRedo,
  useCanvasInteractions,
  type UseCanvasInteractionsOptions,
  type UseCanvasInteractionsResult,
  useCanvasStoreReset,
  useCanvasHistorySetup,
  type UseCanvasHistorySetupResult,
  useImageCoverFit,
  type CoverFitDimensions,
  useFloatingModuleState,
  type FloatingModuleState,
  type UseFloatingModuleStateOptions,
  useFloatingModuleHandlers,
  type UseFloatingModuleHandlersOptions,
  type UseFloatingModuleHandlersResult,
  useCanvasElementHandlers,
  type UseCanvasElementHandlersOptions,
  type UseCanvasElementHandlersResult,
  useCanvasKeyboardHandlers,
  type UseCanvasKeyboardHandlersOptions,
  useFontGeneration,
  useFontLoader,
  type UseFontLoaderOptions,
  type UseFontLoaderResult,
  usePaginatedIcons,
  useMultiPageExport,
  type UseMultiPageExportProps,
  type UseMultiPageExportReturn,
  type ExportProgress,
  usePageManager,
  parseInitialPages,
  useDeckAutoSave,
  SHARE_ORIGINAL_IMAGE_SRC,
  type UsePageManagerOptions,
  type UsePageManagerReturn,
  usePageThumbnails,
  useMobileSheet,
} from '@ggraphic/editor/internal/hooks/index';
export { readInitialDocument, type InitialPageDef } from '@ggraphic/editor/shell';
export * from './sidebar';
export {
  CanvasEditorLayout,
  SIDEBAR_FONT_SIZES,
  type CanvasEditorLayoutProps,
} from '@ggraphic/editor/shell';
export * from './composer';

export type { StockImage } from '@ggraphic/editor/elements';
export type {
  CanvasAiOperation,
  CanvasAiOperationKind,
  CanvasAiSnapshot,
  CanvasAiSuggestion,
  CanvasAiCapabilities,
  CanvasAiSuggestResponse,
} from '@gruenerator/contracts';
export {
  applyOperation,
  type ApplyResult,
  type CanvasAiApplyOverride,
  type CanvasAiApplyOverrides,
  type CanvasAiNamedOption,
  type TemplateAiCapabilities,
} from './ai';
export type { CanvasConfigId } from './templates/registry';
export { preloadCanvasTemplate } from '@ggraphic/editor/config';
export type {
  DreizeilenAlternative,
  DreizeilenFullState,
  DreizeilenFullActions,
} from './configs/dreizeilen.types';

export {
  CANVAS_FORMATS,
  canvasFormatGroupLabel,
  canvasFormatGroupOrder,
  canvasFormats,
  DEFAULT_FORMAT_ID,
  getCanvasFormat,
  getCanvasFormatOrDefault,
  isPrintFormat,
  isSlideFormat,
  isUnsupportedFormatId,
  mmToPx,
  printGeometry,
  UnsupportedCanvasFormatError,
} from '@ggraphic/editor/templates';
export { registerCanvasFormatGroups, registerCanvasFormats } from '@ggraphic/editor/host';
export type {
  BuiltInCanvasFormatGroup,
  CanvasFormatCategory,
  CanvasFormatGroup,
  CanvasFormatIconKey,
  CanvasExportType,
  CanvasPrintSpec,
  PrintCanvasFormat,
  PrintRect,
} from '@ggraphic/editor/templates';
export type { CanvasFormat, CanvasFormatGroupDef } from '@ggraphic/editor/host';

export {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreSelector,
  useCanvasStoreShallow,
  useIsElementSelected,
} from '@ggraphic/editor/store';
export type {
  CanvasEditorStoreApi,
  CanvasEditorStoreState,
  CanvasEditorState,
  CanvasEditorActions,
  CanvasEditorGetters,
} from '@ggraphic/editor/internal/stores/createCanvasEditorStore';
export type { CanvasHistoryEntry } from '@ggraphic/editor/canvas';

export * from './collab';

// Binds the Grünerator's AI operation union for FullCanvasConfig (CanvasAiHostTypes).
export type { SharepicAiCapabilities } from './configs/aiCapabilities';
