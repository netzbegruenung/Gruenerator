import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildFeatureIndex } from '../features/global-search/featureIndex';
import { useAuthStore } from '../stores/authStore';

import { isAdminOnlyPath, isAdminOnlyTool, withAdminToolGate } from './adminToolsGate';

const Page = withAdminToolGate(() => <p>Admin-Inhalt</p>);
const setAdmin = (isAdmin: boolean) =>
  useAuthStore.setState({ user: { id: 'u', is_admin: isAdmin } as never });

beforeEach(() => setAdmin(false));

describe('admin tools gate', () => {
  it('shows the not-found page to non-admins', () => {
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    );
    expect(screen.queryByText('Admin-Inhalt')).toBeNull();
    expect(screen.getByText('Seite nicht gefunden')).toBeTruthy();
  });

  it('renders the page for instance admins', () => {
    setAdmin(true);
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    );
    expect(screen.getByText('Admin-Inhalt')).toBeTruthy();
  });

  it('covers Parteitage and KI-Schnitt with their sub-pages', () => {
    expect(isAdminOnlyPath('/parteitage/ldk-nrw')).toBe(true);
    expect(isAdminOnlyPath('/studio/ki-schnitt')).toBe(true);
    expect(isAdminOnlyPath('/studio/ki-schnitt/radweg-a1b2c3')).toBe(true);
    expect(isAdminOnlyPath('/studio/videoeditor')).toBe(false);
  });

  it('hides the search entries unless the viewer may see admin tools', () => {
    const base = { isAustrian: false, locale: 'de-DE', userAgents: [] };
    const paths = (canSeeAdminTools: boolean) =>
      buildFeatureIndex({ ...base, canSeeAdminTools }).map((h) => h.path);
    expect(paths(false).some(isAdminOnlyPath)).toBe(false);
    expect(paths(true)).toEqual(expect.arrayContaining(['/parteitage', '/studio/ki-schnitt']));
  });
});
