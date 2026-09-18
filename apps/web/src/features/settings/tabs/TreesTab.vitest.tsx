/**
 * Three budget shapes, three different UIs: a metered account sees its stand
 * and the newsletter pitch, a subscriber sees the same stand plus a bonus
 * hint instead of the pitch, and the bgst instance sees neither meter nor
 * pitch — just "Unbegrenzt". `role="progressbar"` is hand-written, so axe
 * runs on the one branch that renders it.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import TreesTab from './TreesTab';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, screen } from '@/test-utils';

const ENDPOINT = 'http://localhost/api/trees/me';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1' } as never, isAuthenticated: true });
});

afterEach(() => {
  server.resetHandlers();
});

function serve(body: Record<string, unknown>) {
  server.use(http.get(ENDPOINT, () => HttpResponse.json(body)));
}

describe('TreesTab', () => {
  it('shows the standard budget and the newsletter pitch, and passes axe', async () => {
    serve({
      used: 2.5,
      limit: 10,
      remaining: 7.5,
      resetsAt: '2026-09-19T00:00:00.000Z',
      newsletterBonus: false,
    });
    const { container } = renderWithProviders(<TreesTab />);

    expect(await screen.findByText('7,5 von 10 Bäumen')).toBeInTheDocument();
    expect(screen.getByText(/^Neu um \d{2}:\d{2} Uhr\.$/)).toBeInTheDocument();

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '2.5');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '10');

    expect(screen.getByText('5 Bäume mehr pro Tag')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Newsletter abonnieren' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(link.getAttribute('href')).toContain('sibforms.com');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the bonus hint instead of the pitch for a subscriber', async () => {
    serve({
      used: 3,
      limit: 15,
      remaining: 12,
      resetsAt: '2026-09-19T00:00:00.000Z',
      newsletterBonus: true,
    });
    renderWithProviders(<TreesTab />);

    expect(await screen.findByText('12 von 15 Bäumen')).toBeInTheDocument();
    expect(screen.getByText('Inklusive 5 Bäume durch dein Newsletter-Abo.')).toBeInTheDocument();
    expect(screen.queryByText('5 Bäume mehr pro Tag')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Newsletter abonnieren' })).not.toBeInTheDocument();
  });

  it('shows no meter and no pitch on an unlimited instance', async () => {
    serve({
      used: 40,
      limit: null,
      remaining: null,
      resetsAt: '2026-09-19T00:00:00.000Z',
      newsletterBonus: false,
    });
    renderWithProviders(<TreesTab />);

    expect(await screen.findByText('Unbegrenzt')).toBeInTheDocument();
    expect(screen.getByText('Unbegrenzt auf dieser Instanz.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('5 Bäume mehr pro Tag')).not.toBeInTheDocument();
    // The cost list still explains what a Baum is worth, budget or not.
    expect(screen.getByText('1 Tiefenrecherche')).toBeInTheDocument();
  });
});
