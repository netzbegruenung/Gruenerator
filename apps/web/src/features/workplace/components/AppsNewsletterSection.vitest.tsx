import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';

import { AppsNewsletterSection } from './AppsNewsletterSection';

import { useAuthStore } from '@/stores/authStore';
import { renderWithProviders, screen } from '@/test-utils';

const TREES = 'http://localhost/api/trees/me';

const platform = vi.hoisted(() => ({ desktopApp: false }));

vi.mock('../../../utils/platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getVisitorDevice: () => null,
  isDesktopApp: () => platform.desktopApp,
}));

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  platform.desktopApp = false;
  useAuthStore.setState({
    user: { id: 'u1', email: 'anna@example.org' } as never,
    isAuthenticated: true,
  });
  serveBudget(false);
});

afterEach(() => {
  server.resetHandlers();
});

function serveBudget(newsletterBonus: boolean) {
  server.use(
    http.get(TREES, () =>
      HttpResponse.json({
        used: 1,
        limit: newsletterBonus ? 15 : 10,
        remaining: 9,
        resetsAt: '2026-11-21T00:00:00.000Z',
        newsletterBonus,
      })
    )
  );
}

const section = () => screen.queryByRole('region', { name: 'Apps & Newsletter' });

describe('AppsNewsletterSection', () => {
  it('shows both cards under one heading', async () => {
    renderWithProviders(<AppsNewsletterSection />);
    expect(await screen.findByRole('region', { name: 'Apps & Newsletter' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Der Grünerator als App' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Newsletter' })).toBeInTheDocument();
  });

  it('leaves the newsletter out for subscribers', async () => {
    serveBudget(true);
    renderWithProviders(<AppsNewsletterSection />);
    expect(
      await screen.findByRole('heading', { name: 'Der Grünerator als App' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Newsletter' })).not.toBeInTheDocument();
  });

  it('renders nothing in the desktop app for a subscriber', async () => {
    platform.desktopApp = true;
    serveBudget(true);
    renderWithProviders(<AppsNewsletterSection />);
    await new Promise((r) => setTimeout(r, 50));
    expect(section()).not.toBeInTheDocument();
  });

  it('renders nothing while the budget is loading', () => {
    server.use(http.get(TREES, () => new Promise(() => undefined)));
    renderWithProviders(<AppsNewsletterSection />);
    expect(section()).not.toBeInTheDocument();
  });
});
