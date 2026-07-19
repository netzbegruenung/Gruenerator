import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../stores/chatConfigStore';

// The shared provider's registration lifecycle uses the store's document/board
// handler registries. These tests assert register/unregister symmetry directly
// against the real store (plain Maps), matching how the provider wires adapters.
describe('editor-surface registration lifecycle', () => {
  beforeEach(() => {
    useChatConfigStore.setState({
      contextProviders: new Map(),
      documentEditHandlers: new Map(),
      boardActionHandlers: new Map(),
    });
  });

  it('registers and unregisters a document edit handler symmetrically', () => {
    const store = useChatConfigStore.getState();
    const handler = vi.fn();
    const unregister = store.registerDocumentEditHandler('doc-1', handler);

    expect(useChatConfigStore.getState().documentEditHandlers.get('doc-1')).toBe(handler);
    unregister();
    expect(useChatConfigStore.getState().documentEditHandlers.has('doc-1')).toBe(false);
  });

  it('registers and unregisters a board action handler symmetrically', () => {
    const store = useChatConfigStore.getState();
    const handler = vi.fn();
    const unregister = store.registerBoardActionHandler('board-1', handler);

    expect(useChatConfigStore.getState().boardActionHandlers.get('board-1')).toBe(handler);
    unregister();
    expect(useChatConfigStore.getState().boardActionHandlers.has('board-1')).toBe(false);
  });

  it('unregister only removes its own handler, not a replacement', () => {
    const store = useChatConfigStore.getState();
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = store.registerDocumentEditHandler('doc-1', first);
    // A remount registers a new handler under the same key before the old
    // cleanup runs (StrictMode / fast key changes).
    useChatConfigStore.getState().registerDocumentEditHandler('doc-1', second);
    unregisterFirst();

    // The newer handler must survive the stale unregister.
    expect(useChatConfigStore.getState().documentEditHandlers.get('doc-1')).toBe(second);
  });

  it('routes the context provider registry per thread', async () => {
    const store = useChatConfigStore.getState();
    const provider = vi.fn().mockReturnValue({ currentDocument: undefined });
    const unregister = store.registerContextProvider('thread-1', provider);

    const registered = useChatConfigStore.getState().contextProviders.get('thread-1');
    expect(registered).toBe(provider);
    await registered?.();
    expect(provider).toHaveBeenCalledOnce();
    unregister();
    expect(useChatConfigStore.getState().contextProviders.has('thread-1')).toBe(false);
  });
});
