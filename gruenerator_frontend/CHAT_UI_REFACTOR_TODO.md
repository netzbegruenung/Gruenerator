# Chat UI Refactor TODO

This document tracks the implementation of a reusable chat UI component extracted from EditorChatNew.jsx.

## Core Principles
- ✅ No code bloat - only extract truly reusable parts
- ✅ No CSS duplication - reuse existing styles
- ✅ React best practices - composition over configuration
- ✅ Minimal new files - lean implementation

## Implementation Tasks

### Phase 1: Analysis & Planning
- [ ] Analyze EditorChatNew.jsx to identify:
  - [ ] Core chat UI elements (message list, input, submit)
  - [ ] Optional features specific to editor (color picker, mode selector)
  - [ ] Styles that are truly chat-generic vs editor-specific

### Phase 2: Create Core ChatUI Component
- [ ] Create `src/components/common/Chat/ChatUI.jsx`
  - [ ] Message list display with animations
  - [ ] Input field with submit button
  - [ ] Loading/typing indicator support
  - [ ] Custom render props for flexibility
  - [ ] Props: messages, onSubmit, isProcessing, placeholder, renderMessage, renderInput

### Phase 3: Refactor EditorChatNew
- [ ] Import ChatUI component
- [ ] Keep all editor-specific logic and features
- [ ] Pass custom renderers for color picker, mode selector
- [ ] Verify backward compatibility
- [ ] Ensure no functionality is lost

### Phase 4: Create Q&A Chat Implementation
- [ ] Create `src/features/qa/components/QAChat.jsx`
  - [ ] Two-panel layout (chat left, results right)
  - [ ] Use ChatUI for conversation panel
  - [ ] Use existing ContentRenderer for results panel
  - [ ] Integrate with existing Citation components
  - [ ] Handle Q&A-specific API calls

### Phase 5: Styling
- [ ] Create `src/assets/styles/features/qa/qa-chat.css`
  - [ ] Only layout styles for two-panel view
  - [ ] Reuse existing chat message styles
  - [ ] Use existing CSS variables
- [ ] Import qa-chat.css in index.css

### Phase 6: Routing & Integration
- [ ] Add routes to `src/config/routes.js`:
  - [ ] `/qa/:id` - Authenticated Q&A chat
  - [ ] `/qa/public/:token` - Public Q&A chat
- [ ] Update DocumentsTab.jsx handleViewQA to navigate to Q&A chat
- [ ] Create QAChatPage wrapper if needed

### Phase 7: Testing
- [ ] Test EditorChatNew still works identically
- [ ] Test Q&A chat functionality
- [ ] Verify no CSS conflicts
- [ ] Check responsive behavior

## Component Architecture

```
ChatUI (Presentational)
├── Props
│   ├── messages: Array of message objects
│   ├── onSubmit: (message) => void
│   ├── isProcessing: boolean
│   ├── placeholder: string
│   ├── renderMessage: (msg) => ReactNode (optional)
│   └── renderInput: (props) => ReactNode (optional)
└── Renders
    ├── Message list with animations
    ├── Input field
    └── Submit button

EditorChatNew (Container)
├── Uses: ChatUI
├── Adds: Color picker, mode selector
└── Keeps: All AI processing, Yjs sync, FormContext

QAChat (Container)
├── Layout: Two panels
├── Left: ChatUI for Q&A conversation
├── Right: ContentRenderer + Citations
└── Logic: Q&A API calls, state management
```

## Files to Create/Modify

### New Files (Minimal)
1. `src/components/common/Chat/ChatUI.jsx` - Core chat component
2. `src/features/qa/components/QAChat.jsx` - Q&A implementation
3. `src/assets/styles/features/qa/qa-chat.css` - Layout styles only

### Modified Files
1. `src/components/common/editor/EditorChatNew.jsx` - Use ChatUI
2. `src/features/auth/components/profile/DocumentsTab.jsx` - Navigate to Q&A
3. `src/config/routes.js` - Add Q&A routes
4. `src/assets/styles/index.css` - Import qa-chat.css

## Success Criteria
- [ ] EditorChatNew works exactly as before
- [ ] Q&A chat provides good UX with two-panel layout
- [ ] No duplicate code or styles
- [ ] Clean, maintainable implementation
- [ ] Follows React composition patterns