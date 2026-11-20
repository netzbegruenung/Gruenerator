import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { NEWSLETTER_SIGNUP_URL } from '@gruenerator/shared/links';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { NewsletterCard } from './NewsletterSection';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, screen, waitFor } from '@/test-utils';

const SUBSCRIBE = 'http://localhost/api/newsletter/subscribe';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'u1', email: 'anna@example.org' } as never,
    isAuthenticated: true,
  });
});

afterEach(() => {
  server.resetHandlers();
});

async function openDialog() {
  const view = renderWithProviders(<NewsletterCard />);
  await view.user.click(screen.getByRole('button', { name: 'Newsletter abonnieren' }));
  const dialog = await screen.findByRole('dialog', { name: 'Newsletter abonnieren' });
  return { ...view, dialog };
}

describe('NewsletterCard', () => {
  it('shows the heading, past issues and the button, and passes axe', async () => {
    const { container } = renderWithProviders(<NewsletterCard />);
    expect(screen.getByRole('heading', { name: 'Newsletter' })).toBeInTheDocument();
    expect(screen.getByText('Das Herbst-Update')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Newsletter abonnieren' })).toBeEnabled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('asks for the address in a dialog, prefilled with the account', async () => {
    const { dialog } = await openDialog();
    expect(screen.getByLabelText('E-Mail-Adresse')).toHaveValue('anna@example.org');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute(
      'href',
      '/datenschutz'
    );
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it('sends another address and asks to confirm the mail', async () => {
    let body: unknown = null;
    server.use(
      http.post(SUBSCRIBE, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ status: 'confirmation_sent' }, { status: 202 });
      })
    );
    const { user } = await openDialog();
    const input = screen.getByLabelText('E-Mail-Adresse');
    await user.clear(input);
    await user.type(input, 'privat@example.org');
    expect(
      screen.getByText('Die 5 Bäume mehr gibt es nur für die Adresse deines Kontos.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bestätigungs-Mail senden' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Fast geschafft: Bitte bestätige die Mail an privat@example.org.'
    );
    expect(body).toEqual({ email: 'privat@example.org' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Newsletter abonnieren' })).not.toBeInTheDocument();
  });

  it('says so when the address already gets the newsletter', async () => {
    server.use(http.post(SUBSCRIBE, () => HttpResponse.json({ status: 'already_subscribed' })));
    const { user } = await openDialog();
    await user.click(screen.getByRole('button', { name: 'Bestätigungs-Mail senden' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Du bekommst den Newsletter schon.'
    );
  });

  it('keeps the dialog open on an error and offers the Brevo form', async () => {
    server.use(
      http.post(SUBSCRIBE, () =>
        HttpResponse.json({ error: 'Brevo ist gerade nicht erreichbar.' }, { status: 502 })
      )
    );
    const { user } = await openDialog();
    await user.click(screen.getByRole('button', { name: 'Bestätigungs-Mail senden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Brevo ist gerade nicht erreichbar.'
    );
    expect(screen.getByRole('link', { name: 'Formular öffnen' })).toHaveAttribute(
      'href',
      NEWSLETTER_SIGNUP_URL
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
