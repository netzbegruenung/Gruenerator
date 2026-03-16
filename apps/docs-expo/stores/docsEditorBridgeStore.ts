import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  text: string;
  timestamp: number;
}

export type DocEditorAction =
  | { type: 'send-chat'; text: string }
  | { type: 'openShare' }
  | { type: 'titleChange'; title: string }
  | { type: 'set-typing'; isTyping: boolean };

interface DocsEditorBridgeState {
  // DOM → Native
  connectionStatus: 'connected' | 'syncing' | 'disconnected';
  documentTitle: string;
  canEdit: boolean;
  isGuest: boolean;
  guestName: string | null;
  chatMessages: ChatMessage[];
  localUserId: string | null;
  typingUsers: string[];

  // Native-only UI state
  sidebarOpen: boolean;
  lastSeenMessageCount: number;

  // Native → DOM (action dispatch)
  pendingAction: DocEditorAction | null;
  actionCounter: number;

  // Setters
  setConnectionStatus: (status: 'connected' | 'syncing' | 'disconnected') => void;
  setDocumentTitle: (title: string) => void;
  setCanEdit: (canEdit: boolean) => void;
  setDocumentMeta: (title: string, canEdit: boolean) => void;
  setGuestInfo: (isGuest: boolean, guestName: string | null) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  setLocalUserId: (userId: string | null) => void;
  setTypingUsers: (users: string[]) => void;
  toggleSidebar: () => void;
  markChatRead: () => void;

  // Action dispatch
  dispatchAction: (action: DocEditorAction) => void;
  clearPendingAction: () => void;
}

export const useDocsEditorBridgeStore = create<DocsEditorBridgeState>((set) => ({
  connectionStatus: 'disconnected',
  documentTitle: '',
  canEdit: false,
  isGuest: false,
  guestName: null,
  chatMessages: [],
  localUserId: null,
  typingUsers: [],
  sidebarOpen: false,
  lastSeenMessageCount: 0,
  pendingAction: null,
  actionCounter: 0,

  setConnectionStatus: (status) =>
    set((s) => (s.connectionStatus === status ? s : { connectionStatus: status })),
  setDocumentTitle: (title) =>
    set((s) => (s.documentTitle === title ? s : { documentTitle: title })),
  setCanEdit: (canEdit) => set((s) => (s.canEdit === canEdit ? s : { canEdit })),
  setDocumentMeta: (title, canEdit) =>
    set((s) =>
      s.documentTitle === title && s.canEdit === canEdit ? s : { documentTitle: title, canEdit }
    ),
  setGuestInfo: (isGuest, guestName) =>
    set((s) => (s.isGuest === isGuest && s.guestName === guestName ? s : { isGuest, guestName })),
  setChatMessages: (messages) => set({ chatMessages: messages }),
  setLocalUserId: (userId) => set((s) => (s.localUserId === userId ? s : { localUserId: userId })),
  setTypingUsers: (users) => set({ typingUsers: users }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  markChatRead: () => set((s) => ({ lastSeenMessageCount: s.chatMessages.length })),
  dispatchAction: (action) =>
    set((s) => ({ pendingAction: action, actionCounter: s.actionCounter + 1 })),
  clearPendingAction: () => set({ pendingAction: null }),
}));
