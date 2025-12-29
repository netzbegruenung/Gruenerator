/**
 * Generator Hooks
 * Barrel export for all generator hooks.
 */

export {
  useTextGeneration,
  type UseTextGenerationOptions,
  type UseTextGenerationReturn,
} from './useTextGeneration';

export {
  useTextEditActions,
  extractEditableText,
  applyChangesToContent,
  type EditChange,
  type ApplyChangesResult,
  type UseTextEditActionsReturn,
} from './useTextEditActions';
