/**
 * Konto starts with the „Grüner Login" h2, then Inhalte; the Papierkorb row is
 * a link. Bedienungshilfen (moved to Allgemein) are covered by GeneralTab's
 * catalog ids, not here.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import AccountTab from './AccountTab';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, screen } from '@/test-utils';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1' } as never });
  server.use(http.get('http://localhost/api/auth/profile', () => HttpResponse.json({ id: 'u1' })));
});

describe('AccountTab', () => {
  it('starts with the Grüner Login heading, offers the Papierkorb, and passes axe', async () => {
    const { container } = renderWithProviders(<AccountTab />);
    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['Grüner Login', 'Inhalte']);
    expect(screen.getByRole('link', { name: /Öffnen/ })).toHaveAttribute('href', '/papierkorb');
    expect(await axe(container)).toHaveNoViolations();
  });
});
