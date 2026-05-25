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

// Mirror of @gruenerator/collab's CollaborationUser, redeclared here so the native
// bundle doesn't pull in the web-only collab package (the real type lives in the DOM).
export interface DocCollaborator {
  id: string;
  name: string;
  color: string;
  avatarRobotId?: number;
}

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
  | { type: 'reject-ai' }
  // Native slash menu picked a block type — clears the typed "/" and converts.
  | { type: 'slash-select'; blockType: string; props?: Record<string, unknown> };

// 'connecting' = initial, before the first successful connect (neutral — no red dot).
// 'syncing' = connected, awaiting the Yjs initial sync. 'disconnected' = a real drop AFTER
// having connected (red). Keeping these distinct is what lets the load show a skeleton
// instead of a jarring red dot.
export type ConnectionStatus = 'connecting' | 'connected' | 'syncing' | 'disconnected';

interface DocsEditorBridgeState {
  // DOM → Native
  connectionStatus: ConnectionStatus;
  documentTitle: string;
  canEdit: boolean;
  isGuest: boolean;
  guestName: string | null;
  chatMessages: ChatMessage[];
  localUserId: string | null;
  typingUsers: string[];
  // Remote collaborators currently in the document (from Yjs awareness), bridged
  // from the DOM editor; rendered as presence avatars in the native top bar.
  collaborators: DocCollaborator[];

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
  // Fullscreen = chrome (top bar / toolbar) hidden. Lifted to the store so the
  // top-bar 3-dot menu can enter it and the bottom-right FAB can exit it.
  fullscreen: boolean;
  // Native slash menu: open while the current block text starts with "/" (the
  // DOM editor detects it and pushes the query); the RN menu renders the items.
  slashMenuOpen: boolean;
  slashQuery: string;
  // "Mit KI bearbeiten" sheet — lifted to the store so both the formatting
  // toolbar and the slash menu's AI item can open it (the toolbar unmounts
  // without a selection, so the sheet lives at screen level).
  aiEditOpen: boolean;
  // Version history sheet — opened from the top-bar overflow menu, rendered at
  // screen level (same store-flag pattern as aiEditOpen).
  versionsOpen: boolean;
  // Bumped after a version restore to remount the editor: the restore writes a
  // new Yjs update server-side that the live Hocuspocus doc won't pick up while
  // connected, so we force a reconnect (mirrors web's "Bitte Seite neu laden").
  editorEpoch: number;

  // Native → DOM (action dispatch)
  pendingAction: DocEditorAction | null;
  actionCounter: number;

  // Setters
  setConnectionStatus: (status: ConnectionStatus) => void;
  setDocumentTitle: (title: string) => void;
  setCanEdit: (canEdit: boolean) => void;
  setDocumentMeta: (title: string, canEdit: boolean) => void;
  setGuestInfo: (isGuest: boolean, guestName: string | null) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  setLocalUserId: (userId: string | null) => void;
  setTypingUsers: (users: string[]) => void;
  setCollaborators: (collaborators: DocCollaborator[]) => void;
  setDocSnapshot: (markdown: string, selectionText: string | null) => void;
  setActiveFormatting: (formatting: ActiveFormattingState) => void;
  setAiReviewPending: (v: boolean) => void;
  toggleSidebar: () => void;
  toggleFullscreen: () => void;
  setFullscreen: (v: boolean) => void;
  setSlashMenu: (open: boolean, query: string) => void;
  setAiEditOpen: (v: boolean) => void;
  setVersionsOpen: (v: boolean) => void;
  bumpEditorEpoch: () => void;
  markChatRead: () => void;

  // Action dispatch
  dispatchAction: (action: DocEditorAction) => void;
  clearPendingAction: () => void;
}

export const useDocsEditorBridgeStore = create<DocsEditorBridgeState>((set) => ({
  connectionStatus: 'connecting',
  documentTitle: '',
  canEdit: false,
  isGuest: false,
  guestName: null,
  chatMessages: [],
  localUserId: null,
  typingUsers: [],
  collaborators: [],
  docMarkdown: '',
  docSelectionText: null,
  activeFormatting: { hasSelection: false, blockType: 'paragraph', blockProps: {} },
  aiReviewPending: false,
  sidebarOpen: false,
  lastSeenMessageCount: 0,
  fullscreen: false,
  slashMenuOpen: false,
  slashQuery: '',
  aiEditOpen: false,
  versionsOpen: false,
  editorEpoch: 0,
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
  setCollaborators: (collaborators) =>
    set((s) =>
      s.collaborators.map((c) => c.id).join() === collaborators.map((c) => c.id).join()
        ? s
        : { collaborators }
    ),
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
  toggleFullscreen: () => set((s) => ({ fullscreen: !s.fullscreen })),
  setFullscreen: (v) => set((s) => (s.fullscreen === v ? s : { fullscreen: v })),
  setSlashMenu: (open, query) =>
    set((s) =>
      s.slashMenuOpen === open && s.slashQuery === query
        ? s
        : { slashMenuOpen: open, slashQuery: query }
    ),
  setAiEditOpen: (v) => set((s) => (s.aiEditOpen === v ? s : { aiEditOpen: v })),
  setVersionsOpen: (v) => set((s) => (s.versionsOpen === v ? s : { versionsOpen: v })),
  bumpEditorEpoch: () => set((s) => ({ editorEpoch: s.editorEpoch + 1 })),
  markChatRead: () => set((s) => ({ lastSeenMessageCount: s.chatMessages.length })),
  dispatchAction: (action) =>
    set((s) => ({ pendingAction: action, actionCounter: s.actionCounter + 1 })),
  clearPendingAction: () => set({ pendingAction: null }),
}));
