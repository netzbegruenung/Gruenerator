import { type DocsAdapter } from '@gruenerator/docs';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../test/msw-server';
import { axe } from '../../test-utils';

import { OfficeLibrary } from './OfficeLibrary';
import { useOfficeLibrary } from './useOfficeLibrary';

const adapter: DocsAdapter = {
  fetch: fetch,
  getApiBaseUrl: () => '/api',
  getHocuspocusUrl: () => '',
  getHocuspocusToken: async () => null,
  getAuthHeaders: async () => ({}),
  onUnauthorized: () => {},
  navigateToDocument: vi.fn(),
  navigateToHome: vi.fn(),
  getDocumentUrl: (id) => `/office/${id}`,
};

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});
function Library() {
  const office = useOfficeLibrary(true);
  return (
    <OfficeLibrary
      office={office}
      adapter={adapter}
      onDeleteDoc={vi.fn()}
      onRenameDoc={vi.fn()}
      onShareDoc={vi.fn()}
      onDeleteBoard={vi.fn()}
      onRenameBoard={vi.fn()}
      onShareBoard={vi.fn()}
    />
  );
}
function renderLibrary() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    </QueryClientProvider>
  );
}
const doc = (id: string, title: string) => ({
  id,
  title,
  document_subtype: 'blank',
  updated_at: '2026-10-20T10:00:00Z',
  content: '<p>Inhalt</p>',
  creator_name: '',
  access_type: 'owner',
  group_shares: [],
});

describe('OfficeLibrary', () => {
  it('renders old documents after loading more and searches beyond loaded pages', async () => {
    server.use(
      http.get('http://localhost/api/content/office', ({ request }) => {
        const params = new URL(request.url).searchParams;
        const offset = Number(params.get('offset'));
        const search = params.get('search');
        return HttpResponse.json({
          items: [
            search
              ? doc('historic', 'Antrag von 2020')
              : offset
                ? doc('old', 'Älteres Dokument')
                : doc('new', 'Neues Dokument'),
          ],
          total: search ? 1 : 51,
          offset,
          limit: 50,
          hasMore: !search && offset === 0,
        });
      })
    );
    const user = userEvent.setup();
    const { container } = renderLibrary();
    await screen.findByRole('heading', { name: 'Neues Dokument' });
    expect(screen.getByText('51 Inhalte')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mehr laden' }));
    await screen.findByRole('heading', { name: 'Älteres Dokument' });
    expect(screen.queryByRole('button', { name: 'Mehr laden' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Office durchsuchen' }), '2020');
    await screen.findByRole('heading', { name: 'Antrag von 2020' });
    expect(screen.queryByRole('heading', { name: 'Neues Dokument' })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('offers type and sort menus with keyboard accessible controls', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get('http://localhost/api/content/office', ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json({ items: [], total: 0, offset: 0, limit: 50, hasMore: false });
      })
    );
    const user = userEvent.setup();
    const { container } = renderLibrary();
    await screen.findByText('Keine Inhalte gefunden');
    await user.click(screen.getByRole('button', { name: 'Filter', exact: true }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Tabellen' }));
    await waitFor(() => expect(seen.at(-1)?.get('typ')).toBe('sheet'));
    await user.click(screen.getByRole('button', { name: 'Sortierung', exact: true }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Älteste zuerst' }));
    await waitFor(() => expect(seen.at(-1)?.get('sort')).toBe('oldest'));
    expect(await axe(container)).toHaveNoViolations();
  });
});
