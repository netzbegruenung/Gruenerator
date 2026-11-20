import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { NewsletterSection } from './NewsletterSection';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, screen } from '@/test-utils';

const TREES = 'http://localhost/api/trees/me';
const SUBSCRIBE = 'http://localhost/api/newsletter/subscribe';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  localStorage.clear();
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

describe('NewsletterSection', () => {
  it('shows the pitch, the address and the consent line, and passes axe', async () => {
    const { container } = renderWithProviders(<NewsletterSection />);
    expect(await screen.findByRole('button', { name: 'Newsletter abonnieren' })).toBeEnabled();
    expect(screen.getByText(/15 statt 10 Bäume/)).toBeInTheDocument();
    expect(screen.getByText(/anna@example\.org/)).toBeInTheDocument();
    expect(screen.getByText(/Erst nach deiner Bestätigung bist du angemeldet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute(
      'href',
      '/datenschutz'
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('asks to confirm the mail after a click', async () => {
    server.use(
      http.post(SUBSCRIBE, () =>
        HttpResponse.json({ status: 'confirmation_sent' }, { status: 202 })
      )
    );
    const { user } = renderWithProviders(<NewsletterSection />);
    await user.click(await screen.findByRole('button', { name: 'Newsletter abonnieren' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Fast geschafft: Bitte bestätige die Mail an anna@example.org.'
    );
    expect(screen.queryByRole('button', { name: 'Newsletter abonnieren' })).not.toBeInTheDocument();
  });

  it('tells an existing subscriber they already get it', async () => {
    server.use(http.post(SUBSCRIBE, () => HttpResponse.json({ status: 'already_subscribed' })));
    const { user } = renderWithProviders(<NewsletterSection />);
    await user.click(await screen.findByRole('button', { name: 'Newsletter abonnieren' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Du bekommst den Newsletter schon.'
    );
  });

  it('shows the error with retry and the hosted form as fallback', async () => {
    server.use(
      http.post(SUBSCRIBE, () =>
        HttpResponse.json({ code: 'brevo_failed', error: 'Mail ging nicht raus.' }, { status: 502 })
      )
    );
    const { user, container } = renderWithProviders(<NewsletterSection />);
    await user.click(await screen.findByRole('button', { name: 'Newsletter abonnieren' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Mail ging nicht raus.');
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Formular öffnen' }).getAttribute('href')).toContain(
      'sibforms.com'
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('is hidden for subscribers', async () => {
    serveBudget(true);
    renderWithProviders(<NewsletterSection />);
    // Give the budget query time to settle, then check nothing rendered.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('region', { name: 'Newsletter' })).not.toBeInTheDocument();
  });

  it('renders nothing while the budget is loading', () => {
    server.use(http.get(TREES, () => new Promise(() => undefined)));
    renderWithProviders(<NewsletterSection />);
    expect(screen.queryByRole('region', { name: 'Newsletter' })).not.toBeInTheDocument();
  });

  it('stays hidden after „Ausblenden", also on the next render', async () => {
    const { user, unmount } = renderWithProviders(<NewsletterSection />);
    await user.click(await screen.findByRole('button', { name: 'Ausblenden' }));
    expect(screen.queryByRole('region', { name: 'Newsletter' })).not.toBeInTheDocument();
    unmount();
    renderWithProviders(<NewsletterSection />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('region', { name: 'Newsletter' })).not.toBeInTheDocument();
  });
});
