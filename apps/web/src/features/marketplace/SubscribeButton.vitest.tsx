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
// The PUT stays open until a test releases it — a fixed delay let a slow runner
// finish the first request before the second click of a double click landed.
let putGate: Promise<void> = Promise.resolve();
// The mutation refetches the list once it settles; a GET that always answered
// `[]` flipped the button back while the test was still asserting.
let subscribedIds: string[] = [];

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  puts = 0;
  putStatus = 200;
  putGate = Promise.resolve();
  subscribedIds = [];
  toastError.mockClear();
  server.use(
    http.get(`${API}/subscriptions`, () => HttpResponse.json({ collectionIds: subscribedIds })),
    http.put(URL, async () => {
      puts += 1;
      await putGate;
      if (putStatus !== 200)
        return HttpResponse.json({ success: false, message: 'kaputt' }, { status: putStatus });
      subscribedIds = ['mustergruen-wahlkampf'];
      return HttpResponse.json({ subscribed: true });
    })
  );
});

describe('SubscribeButton', () => {
  it('shows „Abonnieren“, after click „Abonniert ✓“ and the subline, and calls PUT once on double click', async () => {
    let releasePut = () => {};
    putGate = new Promise((r) => {
      releasePut = r;
    });
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
    releasePut();
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(puts).toBe(1);
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
