import { render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '../stores/authStore';

import { isSitesPath, useCanSeeSites, withSitesGate } from './sitesGate';

const Page = withSitesGate(() => <p>Sites-Inhalt</p>);
const setUser = (user: Record<string, unknown> | null) =>
  useAuthStore.setState({ user: user as never });

beforeEach(() => setUser(null));

describe('sites gate', () => {
  it.each([
    ['true', { id: 'u', sites_unlocked: true }, true],
    ['false', { id: 'u', sites_unlocked: false }, false],
    ['null', { id: 'u', sites_unlocked: null }, false],
    ['missing field', { id: 'u' }, false],
    ['no user', null, false],
  ])('useCanSeeSites with %s', (_label, user, expected) => {
    setUser(user);
    expect(renderHook(() => useCanSeeSites()).result.current).toBe(expected);
  });

  it('shows the not-found page to non-entitled accounts', () => {
    setUser({ id: 'u', sites_unlocked: false });
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    );
    expect(screen.queryByText('Sites-Inhalt')).toBeNull();
    expect(screen.getByText('Seite nicht gefunden')).toBeTruthy();
  });

  it('renders the page for unlocked accounts', () => {
    setUser({ id: 'u', sites_unlocked: true });
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    );
    expect(screen.getByText('Sites-Inhalt')).toBeTruthy();
  });

  it('matches only the /sites path segment', () => {
    expect(isSitesPath('/sites')).toBe(true);
    expect(isSitesPath('/sites/x')).toBe(true);
    expect(isSitesPath('/sitesfoo')).toBe(false);
  });
});
