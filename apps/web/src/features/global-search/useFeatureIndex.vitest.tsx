import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../stores/authStore';

import { useFeatureIndex } from './useFeatureIndex';

const useHiddenAgentIdentifiers = vi.fn((_enabled?: boolean): string[] => []);
const authState = { isBootstrapped: true, isError: false, isAuthenticated: false };

vi.mock('@gruenerator/chat', () => ({
  useHiddenAgentIdentifiers: (enabled?: boolean) => useHiddenAgentIdentifiers(enabled),
}));
vi.mock('../agents/api', () => ({ useUserAgents: () => ({ data: [] }) }));
vi.mock('../../hooks/useAuthBootstrapped', () => ({ useAuthBootstrap: () => authState }));

// Die Suche ist auch auf öffentlichen Seiten offen. Ein Gast darf den
// login-pflichtigen Sichtbarkeits-Endpunkt nicht anfragen: der 401 schickte ihn
// sonst nach /login und meldete einen Session-Teardown (GlitchTip 673).
describe('useFeatureIndex', () => {
  beforeEach(() => useHiddenAgentIdentifiers.mockClear());

  it('fragt die Agent-Sichtbarkeit für Gäste nicht ab', () => {
    authState.isAuthenticated = false;
    renderHook(() => useFeatureIndex());
    expect(useHiddenAgentIdentifiers).toHaveBeenCalledWith(false);
  });

  it('fragt sie für Angemeldete ab', () => {
    authState.isAuthenticated = true;
    renderHook(() => useFeatureIndex());
    expect(useHiddenAgentIdentifiers).toHaveBeenCalledWith(true);
  });
});

describe('useFeatureIndex sites gate', () => {
  const setUser = (user: Record<string, unknown> | null) =>
    useAuthStore.setState({ user: user as never });
  const hasSites = (index: { path: string }[]) => index.some((h) => h.path === '/sites');

  it('contains the Sites hit only for unlocked accounts and rebuilds when the flag flips', () => {
    setUser({ id: 'u', sites_unlocked: false });
    const { result, rerender } = renderHook(() => useFeatureIndex());
    expect(hasSites(result.current)).toBe(false);

    act(() => setUser({ id: 'u', sites_unlocked: true }));
    rerender();
    expect(hasSites(result.current)).toBe(true);

    act(() => setUser({ id: 'u' }));
    rerender();
    expect(hasSites(result.current)).toBe(false);
  });
});
