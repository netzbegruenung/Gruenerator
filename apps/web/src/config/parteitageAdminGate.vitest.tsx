import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildFeatureIndex } from '../features/global-search/featureIndex';
import { useAuthStore } from '../stores/authStore';

import { isParteitagePath, withParteitageAdminGate } from './parteitageAdminGate';

const Page = withParteitageAdminGate(() => <p>Parteitage-Inhalt</p>);
const setAdmin = (isAdmin: boolean) =>
  useAuthStore.setState({ user: { id: 'u', is_admin: isAdmin } as never });

beforeEach(() => setAdmin(false));

describe('parteitage admin gate', () => {
  it('shows the not-found page to non-admins', () => {
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    );
    expect(screen.queryByText('Parteitage-Inhalt')).toBeNull();
    expect(screen.getByText('Seite nicht gefunden')).toBeTruthy();
  });

  it('renders the page for instance admins', () => {
    setAdmin(true);
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    );
    expect(screen.getByText('Parteitage-Inhalt')).toBeTruthy();
  });

  it('hides the search entry unless the viewer may see Parteitage', () => {
    const base = { isAustrian: false, locale: 'de-DE', userAgents: [] };
    const paths = (canSeeParteitage: boolean) =>
      buildFeatureIndex({ ...base, canSeeParteitage }).map((h) => h.path);
    expect(paths(false).some(isParteitagePath)).toBe(false);
    expect(paths(true).some(isParteitagePath)).toBe(true);
  });
});
