import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../test/msw-server';

import { SubscribeButton } from './SubscribeButton';

import { axe, renderWithProviders, screen, waitFor } from '@/test-utils';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));

const API = 'http://localhost/api/marketplace';
const URL = `${API}/collections/mustergruen-wahlkampf/subscription`;

let puts = 0;
let putStatus = 200;

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  puts = 0;
  putStatus = 200;
  toastError.mockClear();
  server.use(
    http.get(`${API}/subscriptions`, () => HttpResponse.json({ collectionIds: [] })),
    http.put(URL, async () => {
      puts += 1;
      await new Promise((r) => setTimeout(r, 30));
      return putStatus === 200
        ? HttpResponse.json({ subscribed: true })
        : HttpResponse.json({ success: false, message: 'kaputt' }, { status: putStatus });
    })
  );
});

describe('SubscribeButton', () => {
  it('shows „Abonnieren“, after click „Abonniert ✓“ and the subline, and calls PUT once on double click', async () => {
    const { user } = renderWithProviders(<SubscribeButton collectionId="mustergruen-wahlkampf" />);
    const button = await screen.findByRole('button', { name: 'Abonnieren' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/kommt automatisch dazu/)).not.toBeInTheDocument();

    await user.dblClick(button);

    expect(await screen.findByRole('button', { name: 'Abonniert ✓' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Neues aus der Kollektion kommt automatisch dazu')).toBeInTheDocument();
    await waitFor(() => expect(puts).toBe(1));
  });

  it('reverts on 500', async () => {
    putStatus = 500;
    const { user } = renderWithProviders(<SubscribeButton collectionId="mustergruen-wahlkampf" />);
    await user.click(await screen.findByRole('button', { name: 'Abonnieren' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Abonnieren fehlgeschlagen.'));
    expect(await screen.findByRole('button', { name: 'Abonnieren' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('axe: no violations', async () => {
    const { container } = renderWithProviders(
      <SubscribeButton collectionId="mustergruen-wahlkampf" />
    );
    await screen.findByRole('button', { name: 'Abonnieren' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
