/**
 * „Geplante Aufgaben" is experimental: the switch starts off and its one write
 * is the profile field.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import GeneralTab from './GeneralTab';

import { useAuthStore } from '@/stores/authStore';
import { renderWithProviders, screen, waitFor } from '@/test-utils';

const PROFILE = 'http://localhost/api/auth/profile';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1' } as never });
  server.use(http.get(PROFILE, () => HttpResponse.json({ user: { id: 'u1' } })));
});

afterEach(() => {
  server.resetHandlers();
});

describe('GeneralTab — Geplante Aufgaben', () => {
  it('is off by default, labelled experimental, and persists through the profile update', async () => {
    let sent: unknown = null;
    server.use(
      http.put(PROFILE, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          success: true,
          profile: { id: 'u1', scheduled_tasks_enabled: true },
        });
      })
    );
    const { user } = renderWithProviders(<GeneralTab />);
    const toggle = await screen.findByRole('switch', { name: 'Geplante Aufgaben einschalten' });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    expect(screen.getAllByText('Experimentell').length).toBeGreaterThan(0);
    await user.click(toggle);
    await waitFor(() => expect(sent).toEqual({ scheduled_tasks_enabled: true }));
  });
});
