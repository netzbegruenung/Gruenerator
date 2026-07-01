export {
  useCollaboration,
  type CollaborationConfig,
  type UseCollaborationOptions,
} from './hooks/useCollaboration';
export { useCollaborators } from './hooks/useCollaborators';
export { useSyncGate } from './hooks/useSyncGate';
export { useAwarenessState } from './hooks/useAwarenessState';
export { PresenceAvatars } from './components/PresenceAvatars';
export { TypingIndicator } from './components/TypingIndicator';
export { generateUserColor } from './utils';
export { removeDocCache, clearAllDocCaches } from './lib/cacheRegistry';
export { getAuthErrorMessage } from './lib/authErrors';
export {
  classifyRoom,
  isAwarenessOnlyRoom,
  isBroadcastOnlyRoom,
  isPersistedRoom,
  type RoomKind,
} from './lib/roomTypes';
export type { CollaborationUser } from './types';
