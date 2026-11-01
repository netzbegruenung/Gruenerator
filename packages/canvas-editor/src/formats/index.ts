// Moved to @ggraphic/editor; kept for the package's public subpath.
export {
  registerCanvasFormats,
  registerCanvasFormatGroups,
  type CanvasFormat,
  type CanvasFormatGroupDef,
} from '@ggraphic/editor/host';
export {
  canvasFormatGroupOrder,
  canvasFormatGroupLabel,
  canvasFormats,
  getCanvasFormat,
  isSlideFormat,
  insertScaleFor,
  isPrintFormat,
  isUnsupportedFormatId,
  getCanvasFormatOrDefault,
  mmToPx,
  printGeometry,
  type CanvasFormatCategory,
  type BuiltInCanvasFormatGroup,
  type CanvasFormatGroup,
  type CanvasFormatIconKey,
  type CanvasExportType,
  type CanvasPrintSpec,
  type PrintCanvasFormat,
  CANVAS_FORMATS,
  DEFAULT_FORMAT_ID,
  UnsupportedCanvasFormatError,
  type PrintRect,
} from '@ggraphic/editor/templates';
export {
  formatIdForSize,
  formatLabel,
  formatDescription,
  type PrintImprintPlacement,
  pinnedFormatId,
} from '@ggraphic/editor/internal/formats/index';
