import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  text: string;
  timestamp: number;
}

export type FormatStyle = 'bold' | 'italic' | 'underline' | 'strike' | 'code';

export interface ActiveFormattingState {
  hasSelection: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  blockType: string;
  blockProps: Record<string, unknown>;
}

export type DocEditorAction =
  | { type: 'send-chat'; text: string }
  | { type: 'openShare' }
  | { type: 'titleChange'; title: string }
  | { type: 'set-typing'; isTyping: boolean }
  | { type: 'format'; style: FormatStyle }
  | { type: 'setBlockType'; blockType: string; props?: Record<string, unknown> }
  | { type: 'setAlignment'; alignment: 'left' | 'center' | 'right' }
  | { type: 'insert-text'; text: string }
  | { type: 'invoke-ai'; prompt: string; useSelection: boolean }
  | { type: 'accept-ai' }
  | { type: 'reject-ai' };

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

  // DOM → Native document snapshot (for the AI assistant context)
  docMarkdown: string;
  docSelectionText: string | null;

  // DOM → Native formatting state
  activeFormatting: ActiveFormattingState;

  // DOM → Native AI review state (true while an AI suggestion awaits accept/reject)
  aiReviewPending: boolean;

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
  setDocSnapshot: (markdown: string, selectionText: string | null) => void;
  setActiveFormatting: (formatting: ActiveFormattingState) => void;
  setAiReviewPending: (v: boolean) => void;
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
  docMarkdown: '',
  docSelectionText: null,
  activeFormatting: { hasSelection: false, blockType: 'paragraph', blockProps: {} },
  aiReviewPending: false,
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
  setChatMessages: (messages) =>
    set((s) => (s.chatMessages.length === messages.length ? s : { chatMessages: messages })),
  setLocalUserId: (userId) => set((s) => (s.localUserId === userId ? s : { localUserId: userId })),
  setTypingUsers: (users) =>
    set((s) => (s.typingUsers.join() === users.join() ? s : { typingUsers: users })),
  setDocSnapshot: (markdown, selectionText) =>
    set((s) =>
      s.docMarkdown === markdown && s.docSelectionText === selectionText
        ? s
        : { docMarkdown: markdown, docSelectionText: selectionText }
    ),
  setActiveFormatting: (formatting) =>
    set((s) => {
      const prev = s.activeFormatting;
      if (
        prev.hasSelection === formatting.hasSelection &&
        prev.bold === formatting.bold &&
        prev.italic === formatting.italic &&
        prev.underline === formatting.underline &&
        prev.strike === formatting.strike &&
        prev.blockType === formatting.blockType
      )
        return s;
      return { activeFormatting: formatting };
    }),
  setAiReviewPending: (v) => set((s) => (s.aiReviewPending === v ? s : { aiReviewPending: v })),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  markChatRead: () => set((s) => ({ lastSeenMessageCount: s.chatMessages.length })),
  dispatchAction: (action) =>
    set((s) => ({ pendingAction: action, actionCounter: s.actionCounter + 1 })),
  clearPendingAction: () => set({ pendingAction: null }),
}));
