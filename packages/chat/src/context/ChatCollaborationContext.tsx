import { createContext, useContext } from 'react';

import type { HocuspocusProvider } from '@hocuspocus/provider';

export interface ChatCollaborationState {
  provider: HocuspocusProvider | null;
  typingUsers: string[];
  setTyping: (isTyping: boolean) => void;
  broadcastNewMessage: () => void;
  broadcastTurnStarted?: () => void;
  /** A teammate's turn is running here (re-attached): not ours to stop. */
  peerRunning?: boolean;
}

const ChatCollaborationContext = createContext<ChatCollaborationState | null>(null);

export const ChatCollaborationProvider = ChatCollaborationContext.Provider;

export function useChatCollaborationContext(): ChatCollaborationState | null {
  return useContext(ChatCollaborationContext);
}
