import { useUserProfileStore } from '@gruenerator/chat/stores';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useUserLandesverbaende } from './useUserLandesverbaende';

import { useAuthStore } from '@/stores/authStore';

function setProfile(
  roles: { ebene: string; rolle: string; bundesland?: string }[],
  locale: 'de-DE' | 'de-AT'
) {
  act(() => {
    useAuthStore.setState({ locale });
    useUserProfileStore.getState().hydrate({ roles, locale, isHydrated: true });
  });
}

describe('useUserLandesverbaende', () => {
  beforeEach(() => {
    act(() => {
      useUserProfileStore.getState().reset();
      useAuthStore.setState({ locale: 'de-DE' });
    });
  });

  it('reports no Landesverband before the profile is hydrated', () => {
    const { result } = renderHook(() => useUserLandesverbaende());
    expect(result.current.lvIds).toEqual([]);
    expect(result.current.isHydrated).toBe(false);
  });

  it('derives the Landesverband from a role Bundesland', () => {
    setProfile(
      [{ ebene: 'land', rolle: 'Mitarbeiter*in Landesgeschäftsstelle', bundesland: 'Berlin' }],
      'de-DE'
    );
    const { result } = renderHook(() => useUserLandesverbaende());
    expect(result.current.lvIds).toEqual(['berlin']);
    expect(result.current.isHydrated).toBe(true);
  });

  it('ignores roles without a Bundesland', () => {
    setProfile([{ ebene: 'bund', rolle: 'Mitarbeiter*in Bundesgeschäftsstelle' }], 'de-DE');
    const { result } = renderHook(() => useUserLandesverbaende());
    expect(result.current.lvIds).toEqual([]);
  });

  it('maps Austrian users to the Österreich Landesverband', () => {
    setProfile([{ ebene: 'gemeinde', rolle: 'Gemeinderät*in', bundesland: 'Tirol' }], 'de-AT');
    const { result } = renderHook(() => useUserLandesverbaende());
    expect(result.current.lvIds).toEqual(['oesterreich']);
  });
});
