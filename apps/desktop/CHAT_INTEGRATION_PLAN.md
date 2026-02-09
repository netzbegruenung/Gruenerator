# Integration Plan: apps/chat into Tauri Desktop App

## Summary

Integrate the Next.js chat application (`apps/chat`) into the Tauri desktop app using a **Shared Package architecture**. Extract chat components to `packages/shared/chat/` as the single source of truth, then consume from both `apps/chat` (standalone web) and `apps/web` (desktop integration).

## Why Shared Package

| Option | Verdict | Reason |
|--------|---------|--------|
| **Shared Package** | ✅ Chosen | Single source of truth, scales with complexity |
| Component Port only | ⚠️ | Quick but creates duplicate code over time |
| Webview/iframe | ❌ | Auth token sharing fails across origins |
| Sidecar (embedded Next.js) | ❌ | Huge bundle, process complexity |
| Multi-window | ⚠️ | Works but loses tab integration |

**Key insight**: Desktop uses Bearer tokens (`Authorization` header) while apps/chat uses session cookies. The shared package uses an **auth adapter pattern** so each consumer provides its own fetch implementation.

---

## Architecture Overview

```
packages/shared/
└── chat/                         # NEW: Shared chat package
    ├── components/               # UI components (framework-agnostic)
    ├── hooks/                    # React hooks with adapter pattern
    ├── stores/                   # Zustand stores
    ├── lib/                      # Agents, utilities, types
    ├── styles/                   # CSS (imported by consumers)
    └── index.ts                  # Public exports

apps/chat/                        # REFACTOR: Consume from shared
└── src/
    ├── app/                      # Next.js routes (unchanged)
    ├── lib/
    │   └── chatAdapter.ts        # Cookie-based auth adapter
    └── components/               # Next.js-specific wrappers only

apps/web/                         # NEW: Desktop integration
└── src/features/chat/
    ├── ChatPage.tsx              # Route component
    ├── chatAdapter.ts            # Bearer token auth adapter
    └── index.ts                  # Re-exports from shared
```

## Implementation Plan

### Phase 1: Create Shared Package Structure

**Create `packages/shared/chat/`:**

```
packages/shared/chat/
├── package.json
├── tsconfig.json
├── src/
│   ├── components/
│   │   ├── ChatLayout.tsx
│   │   ├── ChatMain.tsx
│   │   ├── ChatSidebar.tsx
│   │   ├── AgentSelector.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── MarkdownContent.tsx
│   │   ├── ModelSelector.tsx
│   │   ├── ToolToggles.tsx
│   │   ├── ToolCallUI.tsx
│   │   └── index.ts
│   ├── hooks/
│   │   ├── useChat.ts            # Wraps AI SDK with adapter
│   │   ├── useChatStore.ts
│   │   └── index.ts
│   ├── stores/
│   │   └── chatStore.ts
│   ├── lib/
│   │   ├── agents.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── context/
│   │   └── ChatContext.tsx       # Provides auth adapter
│   ├── styles/
│   │   └── chat.css
│   └── index.ts
└── README.md
```

**Package.json:**
```json
{
  "name": "@gruenerator/chat",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./styles": "./src/styles/chat.css"
  },
  "peerDependencies": {
    "react": "^18 || ^19",
    "ai": "^4.0.0",
    "zustand": "^5.0.0"
  }
}
```

### Phase 2: Define Auth Adapter Interface

**Create adapter interface for cross-platform auth:**

```typescript
// packages/shared/chat/src/context/ChatContext.tsx
import { createContext, useContext, ReactNode } from 'react';

export interface ChatAdapter {
  // Fetch function with auth headers injected
  fetch: (url: string, options?: RequestInit) => Promise<Response>;

  // Get headers for AI SDK streaming
  getHeaders: () => Promise<Record<string, string>>;

  // Credentials mode for fetch
  credentials: RequestCredentials;

  // API base URL
  apiBaseUrl: string;
}

const ChatContext = createContext<ChatAdapter | null>(null);

export function ChatProvider({
  adapter,
  children
}: {
  adapter: ChatAdapter;
  children: ReactNode;
}) {
  return (
    <ChatContext.Provider value={adapter}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatAdapter() {
  const adapter = useContext(ChatContext);
  if (!adapter) {
    throw new Error('useChatAdapter must be used within ChatProvider');
  }
  return adapter;
}
```

### Phase 3: Create useChat Hook with Adapter

```typescript
// packages/shared/chat/src/hooks/useChat.ts
import { useChat as useAIChat, type UseChatOptions } from 'ai/react';
import { useChatAdapter } from '../context/ChatContext';

export function useChat(options: Omit<UseChatOptions, 'credentials' | 'headers'>) {
  const adapter = useChatAdapter();

  return useAIChat({
    ...options,
    api: `${adapter.apiBaseUrl}/api/chat-service/stream`,
    credentials: adapter.credentials,
    headers: adapter.getHeaders,
  });
}
```

### Phase 4: Move Components to Shared Package

**Port components from `apps/chat/src/components/` to `packages/shared/chat/src/components/`**

Changes per component:
- Replace `@/lib/apiClient` → `useChatAdapter().fetch`
- Replace direct `useChat` → import from `../hooks/useChat`
- Remove Next.js-specific imports (use generic React)
- Externalize auth state (receive via context/props)

**Priority order:**
1. `lib/agents.ts` - Agent definitions (no changes needed)
2. `stores/chatStore.ts` - Zustand store (minor path updates)
3. `MarkdownContent.tsx` - Pure component
4. `ToolCallUI.tsx` - Pure component
5. `AgentSelector.tsx` - Uses store
6. `ModelSelector.tsx` - Uses store
7. `ToolToggles.tsx` - Uses store
8. `MessageBubble.tsx` - Composition
9. `ChatSidebar.tsx` - Uses store + adapter
10. `ChatMain.tsx` - Core logic with useChat hook
11. `ChatLayout.tsx` - Top-level composition

### Phase 5: Refactor apps/chat to Use Shared

**Create adapter for cookie-based auth:**

```typescript
// apps/chat/src/lib/chatAdapter.ts
import type { ChatAdapter } from '@gruenerator/chat';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const webChatAdapter: ChatAdapter = {
  fetch: (url, options = {}) => fetch(url, {
    ...options,
    credentials: 'include',
  }),

  getHeaders: async () => ({}),  // Cookies sent automatically

  credentials: 'include',

  apiBaseUrl: API_URL,
};
```

**Update apps/chat page:**

```typescript
// apps/chat/src/app/page.tsx
import { ChatProvider, ChatLayout } from '@gruenerator/chat';
import { webChatAdapter } from '@/lib/chatAdapter';

export default function ChatPage() {
  return (
    <ChatProvider adapter={webChatAdapter}>
      <ChatLayout />
    </ChatProvider>
  );
}
```

### Phase 6: Integrate into apps/web (Desktop)

**Create adapter for Bearer token auth:**

```typescript
// apps/web/src/features/chat/chatAdapter.ts
import type { ChatAdapter } from '@gruenerator/chat';
import { authenticatedFetch, getValidAccessToken } from '@/utils/desktopAuth';
import { isDesktopApp } from '@/utils/platform';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export const desktopChatAdapter: ChatAdapter = {
  fetch: (url, options = {}) => {
    if (isDesktopApp()) {
      return authenticatedFetch(url, options);
    }
    return fetch(url, { ...options, credentials: 'include' });
  },

  getHeaders: async () => {
    if (isDesktopApp()) {
      const token = await getValidAccessToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    }
    return {};
  },

  credentials: isDesktopApp() ? 'omit' : 'include',

  apiBaseUrl: API_URL,
};
```

**Create route component:**

```typescript
// apps/web/src/features/chat/ChatPage.tsx
import { ChatProvider, ChatLayout } from '@gruenerator/chat';
import '@gruenerator/chat/styles';
import { desktopChatAdapter } from './chatAdapter';

export default function ChatPage() {
  return (
    <ChatProvider adapter={desktopChatAdapter}>
      <ChatLayout />
    </ChatProvider>
  );
}
```

### Phase 7: Route & Tab Integration

**Add route to apps/web:**

```typescript
// apps/web/src/config/routes.ts
const ChatPage = lazy(() => import('../features/chat/ChatPage'));
// Add: { path: '/chat', component: ChatPage }
```

**Update tab titles:**

```typescript
// apps/web/src/hooks/useDesktopTabs.ts
const ROUTE_TITLES = {
  // ... existing
  '/chat': 'Chat',
};
```

**Add to menu** (`apps/web/src/components/layout/Header/menuData.tsx`)

### Phase 8: Dependencies & Configuration

**Update pnpm-workspace.yaml** (if not already):
```yaml
packages:
  - 'packages/shared/*'
```

**Add to apps/web/package.json:**
```json
{
  "dependencies": {
    "@gruenerator/chat": "workspace:*",
    "ai": "^4.1.61",
    "@assistant-ui/react": "^0.9.3",
    "@assistant-ui/react-ai-sdk": "^0.9.3",
    "@assistant-ui/react-markdown": "^0.9.3"
  }
}
```

**Update apps/chat/package.json:**
```json
{
  "dependencies": {
    "@gruenerator/chat": "workspace:*"
    // Remove components that moved to shared
  }
}
```

**Tauri CSP** (verify streaming allowed):
```json
"connect-src": "... https://*.gruenerator.eu wss://*.gruenerator.eu ..."
```

---

## Critical Files

| File | Action |
|------|--------|
| `apps/chat/src/components/chat/chat-main.tsx` | Move to `packages/shared/chat/` |
| `apps/chat/src/lib/store.ts` | Move to `packages/shared/chat/stores/` |
| `apps/chat/src/lib/agents.ts` | Move to `packages/shared/chat/lib/` |
| `apps/chat/src/styles/globals.css` | Extract chat styles to shared |
| `apps/web/src/utils/desktopAuth.ts` | Use in desktop adapter |
| `apps/web/src/config/routes.ts` | Add `/chat` route |
| `apps/web/src/hooks/useDesktopTabs.ts` | Add tab title mapping |
| `apps/desktop/src-tauri/tauri.conf.json` | Verify CSP for streaming |
| `pnpm-workspace.yaml` | Ensure shared packages included |

---

## Verification Plan

1. **Shared package builds**: `pnpm --filter @gruenerator/chat build` (if using build step)
2. **Type check**: `pnpm typecheck` passes across all packages
3. **apps/chat still works**: `pnpm --filter @gruenerator/apps-chat dev` on port 3210
4. **apps/web works**: `pnpm dev:web` includes `/chat` route
5. **Desktop dev**: `pnpm --filter @gruenerator/desktop dev`
6. **Manual testing**:
   - **Web (apps/chat)**: Login → chat → verify cookies work
   - **Desktop**: Login → Chat tab → verify Bearer token works
   - Both: Send message, verify streaming
   - Both: Switch agents, use tools
   - Both: Dark/light mode
   - Desktop: Tab management (open, close, reopen chat)
7. **Cross-platform**: Test desktop on Windows, macOS, Linux

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| AI SDK streaming + Bearer auth | Test early; SDK v4 supports async headers |
| Store key conflicts | Use unique persistence key per app |
| Theme mismatches | Audit CSS variables; both use same tokens |
| Bundle size increase | Tree-shake; AI SDK already in apps/chat |
| Breaking apps/chat during refactor | Keep apps/chat working throughout migration |
| Circular dependencies | Careful package structure; lint with eslint-plugin-import |

---

## Migration Order (Safe Refactoring)

To avoid breaking apps/chat during the migration:

1. **Create shared package** with empty structure
2. **Copy (don't move)** files from apps/chat to shared
3. **Update shared** imports to be relative within package
4. **Add shared as dependency** to apps/chat
5. **Update apps/chat** to import from `@gruenerator/chat`
6. **Verify apps/chat** still works
7. **Delete duplicates** from apps/chat
8. **Add shared to apps/web** and create desktop integration
9. **Verify both apps** work
