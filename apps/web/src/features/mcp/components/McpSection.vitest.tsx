/**
 * Bekannte Konnektoren (Bahn, Wetter, Rateo, …) sind seit 11/2026 Karten im
 * Verzeichnis wie jeder andere Dienst: „Verbinden" legt die Zeile an, danach
 * steht sie unter „Verbunden" mit Schalter und „Entfernen" — aber ohne URL,
 * Token oder Umbenennen, weil der Endpunkt in der Deploy-Umgebung liegt.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';

import McpSection from './McpSection';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, userEvent } from '@/test-utils';

const API = 'http://localhost/api';

const RATEO_ENTRY = {
  name: 'rateo',
  title: 'Rateo',
  description: 'Anträge, Anfragen und Beschlüsse der Berliner Bezirksverordnetenversammlungen.',
  url: '',
  websiteUrl: null,
  authHint: 'none',
  authOptions: ['none'],
  recommended: true,
  category: 'Politik & Verwaltung',
  registryKey: 'rateo',
};

const RATEO_ROW = {
  id: '7a1b0000-0000-0000-0000-000000000000',
  name: 'Rateo',
  url: '',
  authType: 'none',
  hasToken: false,
  enabled: true,
  createdAt: '2026-11-11T00:00:00.000Z',
  updatedAt: '2026-11-11T00:00:00.000Z',
  description: RATEO_ENTRY.description,
  toolNames: null,
  managed: true,
  category: 'Politik & Verwaltung',
  registryKey: 'rateo',
};

function serve(servers: unknown[]) {
  const connected: string[] = [];
  server.use(
    http.get(`${API}/mcp/servers`, () => HttpResponse.json({ servers })),
    http.get(`${API}/mcp/servers/registry`, () =>
      HttpResponse.json({
        recommended: [RATEO_ENTRY],
        servers: [],
        nextCursor: null,
        oauthRedirectUri: null,
      })
    ),
    http.post(`${API}/mcp/servers/connect/:key`, ({ params }) => {
      connected.push(String(params.key));
      return HttpResponse.json({ server: RATEO_ROW });
    })
  );
  return connected;
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: API, authMode: 'cookie' }));
});

describe('McpSection — bekannte Konnektoren', () => {
  it('bietet Rateo als Karte an und verbindet über den Schlüssel, nicht über eine URL', async () => {
    const connected = serve([]);
    const { container } = renderWithProviders(<McpSection onSuccess={vi.fn()} onError={vi.fn()} />);

    const title = await screen.findByText('Rateo');
    const card = title.closest('div.flex') ?? title.parentElement!;
    await userEvent.click(
      within(card.parentElement as HTMLElement).getByRole('button', { name: 'Verbinden' })
    );

    await waitFor(() => expect(connected).toEqual(['rateo']));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('zeigt eine verbundene Rateo-Zeile unter „Verbunden" mit Schalter und Entfernen, ohne Karte', async () => {
    serve([RATEO_ROW]);
    renderWithProviders(<McpSection onSuccess={vi.fn()} onError={vi.fn()} />);

    await screen.findByText(RATEO_ROW.description);
    expect(screen.getAllByText('Rateo')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Verbinden' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entfernen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neu verbinden' })).not.toBeInTheDocument();
  });
});

/**
 * Microsoft 365 ist kein MCP-Server, sondern eine Nango-Verbindung, steht aber im
 * selben Verzeichnis unter „Sonstige" — und vorerst nur für Instanz-Admins.
 */
describe('McpSection — Microsoft 365', () => {
  const STATUS_URL = `${API}/auth/admin/connector-test`;

  function serveMicrosoft(connected: boolean) {
    const statusHits = { count: 0 };
    serve([]);
    server.use(
      http.get(STATUS_URL, () => {
        statusHits.count += 1;
        return HttpResponse.json({
          success: true,
          nangoConfigured: true,
          pickerConfigured: false,
          providers: [
            {
              provider: 'microsoft',
              label: 'Microsoft 365',
              connected,
              connectedAt: connected ? '2026-11-01T10:00:00.000Z' : null,
            },
          ],
        });
      })
    );
    return statusHits;
  }

  function setAdmin(isAdmin: boolean) {
    useAuthStore.setState({ user: { id: 'u1', is_admin: isAdmin } as never });
  }

  afterEach(() => useAuthStore.setState({ user: null } as never));

  it('steht für Admins unter „Sonstige" mit „Verbinden"', async () => {
    setAdmin(true);
    serveMicrosoft(false);
    renderWithProviders(<McpSection onSuccess={vi.fn()} onError={vi.fn()} />);

    const title = await screen.findByText('Microsoft 365');
    const group = title.closest('div.grid')?.parentElement as HTMLElement;
    expect(within(group).getByRole('heading', { name: 'Sonstige' })).toBeInTheDocument();
    const card = title.parentElement as HTMLElement;
    expect(within(card).getByRole('button', { name: 'Verbinden' })).toBeInTheDocument();
  });

  it('zeigt verbunden „Trennen" statt „Verbinden"', async () => {
    setAdmin(true);
    serveMicrosoft(true);
    renderWithProviders(<McpSection onSuccess={vi.fn()} onError={vi.fn()} />);

    const card = (await screen.findByText('Microsoft 365')).parentElement as HTMLElement;
    expect(await within(card).findByRole('button', { name: 'Trennen' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Verbinden' })).not.toBeInTheDocument();
  });

  it('fehlt für Nicht-Admins und fragt den Admin-Status nicht ab', async () => {
    setAdmin(false);
    const statusHits = serveMicrosoft(true);
    renderWithProviders(<McpSection onSuccess={vi.fn()} onError={vi.fn()} />);

    await screen.findByText('Rateo');
    expect(screen.queryByText('Microsoft 365')).not.toBeInTheDocument();
    expect(statusHits.count).toBe(0);
  });
});
