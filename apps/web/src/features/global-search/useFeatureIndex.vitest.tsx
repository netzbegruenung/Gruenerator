import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
