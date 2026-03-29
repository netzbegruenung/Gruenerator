// Context & Adapter
export {
  SlidesProvider,
  useSlidesAdapter,
  createSlidesApiClient,
  type SlidesAdapter,
  type SlidesApiClient,
} from './context/SlidesContext';

// Types
export type {
  Slide,
  Presentation,
  PresentationWithSlides,
  PresentationTheme,
  PermissionEntry,
  LayoutRegistryEntry,
  GenerationTone,
  GenerationVerbosity,
  ExportFormat,
  GeneratePresentationRequest,
  GeneratePresentationResponse,
} from './types/slide';

// Layouts — re-export from Presenton's registry (copied as-is)
export {
  allLayouts,
  generalTemplates,
  neoGeneralTemplates,
  modernTemplates,
  neoModernTemplates,
  standardTemplates,
  neoStandardTemplates,
  swiftTemplates,
  neoSwiftTemplates,
  templates,
  getTemplatesByTemplateName,
  getTemplateByLayoutId,
  getLayoutByLayoutId,
} from './components/layouts/index';

export { ImageSchema, IconSchema } from './components/layouts/defaultSchemes';

// Schema-only exports (safe for backend — no React)
export { getLayoutSchema, getAllLayoutIds, layoutSchemaMap } from './schemas/index';

// Components — Editor
export { SlideEditor } from './components/editor/SlideEditor';
export { SlideCanvas, SlideCanvasAutoScale } from './components/editor/SlideCanvas';
export { SlidePanel } from './components/editor/SlidePanel';
export { SlideToolbar } from './components/editor/SlideToolbar';

// Components — List
export { PresentationList } from './components/PresentationList';

// Components — Dialogs
export { GeneratePresentationDialog } from './components/GeneratePresentationDialog';

// Components — Utilities
export { RemoteSvgIcon, useRemoteSvgIcon } from './components/RemoteSvgIcon';

// Stores
export { usePresentationStore } from './stores/presentationStore';
