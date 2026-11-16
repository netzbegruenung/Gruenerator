import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CurrentUserContext } from '../context/CurrentUserContext';

const aui = vi.hoisted(() => ({
  state: { thread: { messages: [] as unknown[] }, message: { id: '' } },
}));
vi.mock('@assistant-ui/react', () => ({
  useAuiState: (sel: (s: typeof aui.state) => unknown) => sel(aui.state),
}));

const { mayReplaceTurn, useMayReplaceTurn } = await import('./useMayReplaceTurn');
const { cacheThreadShareMetaForTest } = await import('../runtime/GrueneratorThreadListAdapter');
const { useAgentStore } = await import('../stores/chatStore');

const user = (id: string, senderId?: string) => ({
  id,
  role: 'user',
  metadata: senderId ? { custom: { senderId } } : {},
});
const assistant = (id: string) => ({ id, role: 'assistant', metadata: {} });

describe('mayReplaceTurn', () => {
  const thread = [user('u1', 'anna'), assistant('a1'), user('u2', 'ben'), assistant('a2')];

  it('allows edit and regenerate on the own turn', () => {
    const own = [user('u1', 'anna'), assistant('a1'), user('u2', 'anna')];
    expect(mayReplaceTurn(own, 'u1', 'anna')).toBe(true);
    expect(mayReplaceTurn(thread, 'a1', 'anna')).toBe(true);
  });

  it('hides edit on a teammate’s message and regenerate on the reply to it', () => {
    expect(mayReplaceTurn(thread, 'u2', 'anna')).toBe(false);
    expect(mayReplaceTurn(thread, 'a2', 'anna')).toBe(false);
  });

  it('hides edit on the own message when a teammate wrote later', () => {
    const t = [user('u1', 'anna'), assistant('a1'), user('u2', 'ben'), assistant('a2')];
    expect(mayReplaceTurn(t, 'u1', 'anna')).toBe(false);
  });

  it('the thread owner may replace anything when the chat is no team chat (fork, person-shared)', () => {
    expect(mayReplaceTurn(thread, 'u2', 'anna', true)).toBe(true);
    expect(mayReplaceTurn(thread, 'a2', 'anna', true)).toBe(true);
    expect(mayReplaceTurn(thread, 'u1', 'anna', true)).toBe(true);
  });

  it('keeps messages without senderId (private chats, legacy rows) editable', () => {
    expect(mayReplaceTurn([user('u', undefined), assistant('a')], 'u', 'anna')).toBe(true);
    expect(mayReplaceTurn([user('u', undefined), assistant('a')], 'a', 'anna')).toBe(true);
  });
});

describe('useMayReplaceTurn', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CurrentUserContext.Provider value="anna">{children}</CurrentUserContext.Provider>
  );

  it('reads the current user from context and the message from the thread', () => {
    aui.state = { thread: { messages: [user('u2', 'ben')] }, message: { id: 'u2' } };
    expect(renderHook(() => useMayReplaceTurn(), { wrapper }).result.current).toBe(false);
    aui.state = { thread: { messages: [user('u1', 'anna')] }, message: { id: 'u1' } };
    expect(renderHook(() => useMayReplaceTurn(), { wrapper }).result.current).toBe(true);
  });

  it('hook: owner of a non-team thread may edit a foreign turn; in a team chat not', () => {
    aui.state = { thread: { messages: [user('u2', 'ben')] }, message: { id: 'u2' } };
    useAgentStore.setState({ currentThreadId: 'th-fork' });
    cacheThreadShareMetaForTest('th-fork', { accessType: 'owner', teamShared: false });
    expect(renderHook(() => useMayReplaceTurn(), { wrapper }).result.current).toBe(true);
    cacheThreadShareMetaForTest('th-fork', { accessType: 'owner', teamShared: true });
    expect(renderHook(() => useMayReplaceTurn(), { wrapper }).result.current).toBe(false);
    cacheThreadShareMetaForTest('th-fork', { accessType: 'shared', teamShared: false });
    expect(renderHook(() => useMayReplaceTurn(), { wrapper }).result.current).toBe(false);
  });
});
