import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import MicrosoftConnectorSection from './MicrosoftConnectorSection';

import { useAuthStore } from '@/stores/authStore';
import { server } from '@/test/msw-server';
import { renderWithProviders } from '@/test-utils';

const statusUrl = 'http://localhost/api/auth/admin/connector-test';

function mockStatus(connected: boolean) {
  server.use(
    http.get(statusUrl, () =>
      HttpResponse.json({
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
      })
    )
  );
}

function setAdmin(isAdmin: boolean) {
  useAuthStore.setState({ user: { id: 'u1', is_admin: isAdmin } as never });
}

describe('MicrosoftConnectorSection', () => {
  beforeAll(() => {
    setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
  });
  beforeEach(() => setAdmin(false));

  it('zeigt Admins die Karte mit „Verbinden", solange nichts verbunden ist', async () => {
    setAdmin(true);
    mockStatus(false);
    renderWithProviders(<MicrosoftConnectorSection onSuccess={vi.fn()} onError={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Verbinden' })).toBeInTheDocument();
  });

  it('zeigt Admins „Verbunden" und „Trennen" bei bestehender Verbindung', async () => {
    setAdmin(true);
    mockStatus(true);
    renderWithProviders(<MicrosoftConnectorSection onSuccess={vi.fn()} onError={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Trennen' })).toBeInTheDocument();
    expect(screen.getByText('Verbunden')).toBeInTheDocument();
  });

  it('rendert für Nicht-Admins nichts und fragt den Status nicht ab', () => {
    const hit = vi.fn();
    server.use(
      http.get(statusUrl, () => {
        hit();
        return HttpResponse.json({});
      })
    );
    const { container } = renderWithProviders(
      <MicrosoftConnectorSection onSuccess={vi.fn()} onError={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(hit).not.toHaveBeenCalled();
  });
});
