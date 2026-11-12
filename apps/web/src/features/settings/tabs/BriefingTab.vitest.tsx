/**
 * The Tagesbriefing is opt-in: the switch starts off and its one write is the
 * profile field. The dev rerun buttons exist only behind the auth bypass.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import BriefingTab from './BriefingTab';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, screen, waitFor } from '@/test-utils';

const PROFILE = 'http://localhost/api/auth/profile';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1' } as never });
  server.use(http.get(PROFILE, () => HttpResponse.json({ id: 'u1' })));
});

afterEach(() => {
  server.resetHandlers();
});

describe('BriefingTab', () => {
  it('persists the switch through the profile update, and passes axe', async () => {
    let sent: unknown = null;
    server.use(
      http.put(PROFILE, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          success: true,
          profile: { id: 'u1', proactive_briefing_enabled: true },
        });
      })
    );
    const { user, container } = renderWithProviders(<BriefingTab />);
    const toggle = await screen.findByRole('switch', { name: 'Tagesbriefing im Chat einschalten' });
    await waitFor(() => expect(toggle).toBeEnabled());
    // opt-in: off until the person switches it on
    expect(toggle).not.toBeChecked();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(toggle);
    await waitFor(() => expect(sent).toEqual({ proactive_briefing_enabled: true }));
  });

  it('hides the dev rerun buttons outside the dev auth bypass', async () => {
    renderWithProviders(<BriefingTab />);
    await screen.findByRole('switch', { name: 'Tagesbriefing im Chat einschalten' });
    expect(screen.queryByText('Folgetag simulieren')).not.toBeInTheDocument();
  });
});
