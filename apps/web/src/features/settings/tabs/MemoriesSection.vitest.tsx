/**
 * The tab is the one place a person sees what the Grünerator keeps about them.
 * Three things must hold: the list renders what the contract returns (kind
 * chip and text), the empty state tells them how memories come to exist,
 * and a failing endpoint says so instead of showing an empty list as truth.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import MemoriesSection from './MemoriesSection';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, screen, waitFor } from '@/test-utils';

const LIST = 'http://localhost/api/memory';
const PROFILE = 'http://localhost/api/auth/profile';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1' } as never });
  server.use(http.get(PROFILE, () => HttpResponse.json({ id: 'u1', memory_enabled: true })));
});

afterEach(() => {
  server.resetHandlers();
});

const ROWS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'anweisung',
    text: 'Immer in der Sie-Form schreiben.',
    source: 'chat',
    created_at: '2026-08-12T10:00:00.000Z',
    updated_at: '2026-08-12T10:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'fakt',
    text: 'Schreibt für den Kreisverband Köln.',
    source: 'manual',
    created_at: '2026-07-03T08:00:00.000Z',
    updated_at: '2026-07-03T08:00:00.000Z',
  },
];

describe('MemoriesSection', () => {
  it('renders every memory with its kind and passes axe', async () => {
    server.use(http.get(LIST, () => HttpResponse.json({ memories: ROWS })));
    const { container } = renderWithProviders(<MemoriesSection />);

    expect(await screen.findByText('Immer in der Sie-Form schreiben.')).toBeInTheDocument();
    expect(screen.getByText('Schreibt für den Kreisverband Köln.')).toBeInTheDocument();
    expect(screen.getByText('Erinnerungen (2)')).toBeInTheDocument();
    // Kind chips on the rows (the filter buttons carry the same words, hence ≥).
    expect(screen.getAllByText('Anweisung').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Manuell')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Gedächtnis einschalten' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('explains how memories come to exist when there are none', async () => {
    server.use(http.get(LIST, () => HttpResponse.json({ memories: [] })));
    renderWithProviders(<MemoriesSection />);
    expect(await screen.findByText(/merk dir/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Erinnerungen durchsuchen...')).not.toBeInTheDocument();
  });

  it('shows the server message instead of an empty list when the list fails', async () => {
    server.use(
      http.get(LIST, () =>
        HttpResponse.json(
          { message: 'Das Gedächtnis ist gerade nicht erreichbar.' },
          { status: 500 }
        )
      )
    );
    renderWithProviders(<MemoriesSection />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Das Gedächtnis ist gerade nicht erreichbar.'
      )
    );
  });

  it('persists the switch through the profile update', async () => {
    server.use(http.get(LIST, () => HttpResponse.json({ memories: [] })));
    let sent: unknown = null;
    server.use(
      http.put(PROFILE, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ success: true, profile: { id: 'u1', memory_enabled: false } });
      })
    );
    const { user } = renderWithProviders(<MemoriesSection />);
    const toggle = await screen.findByRole('switch', { name: 'Gedächtnis einschalten' });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    await waitFor(() => expect(sent).toEqual({ memory_enabled: false }));
  });

  it('filters by kind client-side', async () => {
    server.use(http.get(LIST, () => HttpResponse.json({ memories: ROWS })));
    const { user } = renderWithProviders(<MemoriesSection />);
    await screen.findByText('Immer in der Sie-Form schreiben.');
    await user.click(screen.getByRole('button', { name: 'Fakt', pressed: false }));
    expect(screen.queryByText('Immer in der Sie-Form schreiben.')).not.toBeInTheDocument();
    expect(screen.getByText('Schreibt für den Kreisverband Köln.')).toBeInTheDocument();
  });
});
