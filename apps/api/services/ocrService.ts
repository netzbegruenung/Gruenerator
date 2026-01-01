/**
 * OcrService - Backward Compatibility Wrapper
 *
 * Re-exports from ./OcrService/ folder module.
 * This allows existing imports to continue working:
 *
 * import { ocrService } from './ocrService.js'
 * import { OCRService } from './ocrService.js'
 *
 * Both the folder path and root-level path will work identically.
 */

export * from './OcrService/index.js';
export { default } from './OcrService/index.js';
