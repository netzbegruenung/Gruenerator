import { GRUENE_KIND_RENDERERS, registerKindRenderers } from './brand/grueneKinds';

// The Grünerator's own element kinds (the Balken) draw wherever this package
// draws: every canvas the app renders, on screen or offscreen, comes through
// this entry. Installed here rather than in apps/web's startup like the asset
// catalogue, because the renderers pull Konva, which the app's first load must
// not carry. `package.json` lists this file under `sideEffects`, or the
// bundler would drop the call whenever a consumer uses only re-exports.
registerKindRenderers(GRUENE_KIND_RENDERERS);

export { MasterCanvasEditor } from './MasterCanvasEditor';
export { ControllableCanvasWrapper } from './CanvasEditorRouter';
export type { ControllableCanvasWrapperProps, CanvasInitialPropsMap } from './CanvasEditorRouter';
export type {
  CanvasEditorExportApi,
  CanvasEditorHostChrome,
} from './components/CanvasEditor/types';
export { EDITOR_KEY_SHIELD_ATTRIBUTE } from './components/CanvasEditor/hooks/usePageUndoRedoShortcuts';
export { templateFitsFormat } from './utils/templateRegistry';
export {
  CanvasEditorProvider,
  useCanvasEditorServices,
} from '@ggraphic/editor/CanvasEditorProvider';
export { canvasImageSourceUrl } from '@ggraphic/editor/utils/canvasImageSource';
export type { CanvasImageUrlService } from '@ggraphic/editor/hostServices';
export type {
  CanvasEditorServices,
  ChatSectionContentProps,
  CanvasAiEditBridge,
  CanvasSpecEditBridge,
} from '@ggraphic/editor/CanvasEditorProvider';
export type {
  CanvasFeedbackService,
  CanvasVorlagenService,
  VorlagePage,
} from './grueneratorHostServices';

export { StandaloneCanvas } from './components/StandaloneCanvas';
export { ConfigCanvas } from '@ggraphic/editor/components/ConfigCanvas';
export { commitOpenTextEdit } from '@ggraphic/editor/components/CanvasTextOverlay';
export type { StandaloneCanvasProps } from './components/StandaloneCanvas';
export type { ConfigCanvasProps } from '@ggraphic/editor/components/ConfigCanvas';
export { GenericCanvas } from '@ggraphic/editor/components/GenericCanvas';
export type {
  GenericCanvasProps,
  GenericCanvasRef,
} from '@ggraphic/editor/components/GenericCanvas';
export { defineTemplate, registerTemplates } from './templates/registry';
export type { TemplateDefinition, TemplateId, AnyCanvasConfig } from './templates/registry';

export * from '@ggraphic/editor/primitives/index';
export { BalkenGroup } from './primitives/BalkenGroup';
export type { BalkenGroupProps } from './primitives/BalkenGroup';
export * from './composed';
export * from './utils';
export * from '@ggraphic/editor/hooks/index';
export * from './sidebar';
export * from './layouts';
export * from './composer';

export type { StockImage } from '@ggraphic/editor/common/imageSourceTypes';
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
export { preloadCanvasTemplate } from '@ggraphic/editor/configs/configLoader';
export type {
  DreizeilenAlternative,
  DreizeilenFullState,
  DreizeilenFullActions,
} from './configs/dreizeilen.types';

export {
  CANVAS_FORMATS,
  CANVAS_FORMAT_GROUP_LABEL,
  CANVAS_FORMAT_GROUP_ORDER,
  DEFAULT_FORMAT_ID,
  getCanvasFormat,
  getCanvasFormatOrDefault,
  isPrintFormat,
  isSlideFormat,
  isUnsupportedFormatId,
  mmToPx,
  printGeometry,
  UnsupportedCanvasFormatError,
} from '@ggraphic/editor/formats/index';
export type {
  CanvasFormat,
  CanvasFormatCategory,
  CanvasFormatGroup,
  CanvasFormatIconKey,
  CanvasExportType,
  CanvasPrintSpec,
  PrintCanvasFormat,
  PrintRect,
} from '@ggraphic/editor/formats/index';

export {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreSelector,
  useCanvasStoreShallow,
  useIsElementSelected,
} from '@ggraphic/editor/stores/CanvasStoreProvider';
export type {
  CanvasEditorStoreApi,
  CanvasEditorStoreState,
  CanvasEditorState,
  CanvasEditorActions,
  CanvasEditorGetters,
} from '@ggraphic/editor/stores/createCanvasEditorStore';
export type { CanvasHistoryEntry } from '@ggraphic/editor/types/editorTypes';

export * from './collab';

// Binds the Grünerator's AI operation union for FullCanvasConfig (CanvasAiHostTypes).
export type { SharepicAiCapabilities } from './configs/aiCapabilities';
