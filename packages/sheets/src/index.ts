export { SheetsEditor, type SheetsEditorProps } from './components/SheetsEditor.js';
export { attachYjsBridge, type AwarenessLike, type SheetsBridge } from './collab/bridge.js';
export {
  SHEET_YDOC_KEYS,
  SHEET_META_KEYS,
  SHEET_SCHEMA_VERSION,
  type SheetMutationEntry,
} from './lib/ydocSchema.js';
export { applySheetOperations } from './ai/applySheetOperations.js';
export { serializeSheetContext } from './ai/serializeSheetContext.js';
export type { FUniver } from '@univerjs/presets';
export type { FWorkbook } from '@univerjs/preset-sheets-core';
