import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * #5900: `crypto.randomUUID` exists only in secure contexts. On a plain-http
 * origin (phone over the LAN) the store created its initial tab at module
 * load and the whole web entry threw before mounting.
 */
describe('desktopTabsStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('loads and creates tabs without crypto.randomUUID (insecure context)', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    });
    vi.resetModules();

    const { useDesktopTabsStore } = await import('./desktopTabsStore');
    const state = useDesktopTabsStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(state.tabs[0]?.id);

    const newId = useDesktopTabsStore.getState().createTab('/chat', 'Chat');
    expect(newId).not.toBe(state.tabs[0]?.id);
    expect(useDesktopTabsStore.getState().tabs).toHaveLength(2);
  });
});
