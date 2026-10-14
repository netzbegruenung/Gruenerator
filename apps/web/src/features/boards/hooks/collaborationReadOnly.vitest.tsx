import { useCollaboration } from '@gruenerator/collab';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// A provider stand-in that lets the test play the server's `authenticated` message.
const providers: Array<{ emit: (event: string, data: unknown) => void }> = [];
vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProvider: class {
    awareness = { setLocalStateField: () => {}, setLocalState: () => {} };
    private handlers = new Map<string, (data: unknown) => void>();
    constructor() {
      providers.push(this);
    }
    on(event: string, handler: (data: unknown) => void) {
      this.handlers.set(event, handler);
    }
    emit(event: string, data: unknown) {
      this.handlers.get(event)?.(data);
    }
    connect() {}
    disconnect() {}
    destroy() {}
  },
}));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    synced = true;
    whenSynced = Promise.resolve();
    _db = Promise.resolve();
    on() {}
    destroy() {}
  },
}));

const config = { url: 'ws://test', getToken: () => Promise.resolve('t') };

describe('useCollaboration read-only scope', () => {
  it('follows the scope the server authenticated the connection with', async () => {
    const { result } = renderHook(() =>
      useCollaboration({ documentId: 'board-1', user: { id: 'u1' }, config })
    );
    await waitFor(() => expect(result.current.provider).not.toBeNull());
    expect(result.current.isReadOnly).toBe(false);

    act(() => providers.at(-1)?.emit('authenticated', { scope: 'readonly' }));
    expect(result.current.isReadOnly).toBe(true);

    act(() => providers.at(-1)?.emit('authenticated', { scope: 'read-write' }));
    expect(result.current.isReadOnly).toBe(false);
  });
});
