export {
  EditorAssistantProvider,
  useEditorAssistant,
  type EditorAssistantProviderProps,
} from './EditorAssistantProvider';
export {
  type EditorAssistantState,
  type EditorSurfaceAdapter,
  type EditorSurfaceKind,
  type EditorToolConfig,
  type EditorRegistrationCtx,
} from './types';
export { deriveGateState, shouldImportHistory, isReady } from './helpers';
export { usePeerMessageSync } from './usePeerMessageSync';
