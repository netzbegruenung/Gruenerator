import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../test/msw-server';

import PrintVorlageInstantiatePage from './PrintVorlageInstantiatePage';

vi.mock('@gruenerator/canvas-editor/composer', () => ({
  ensureFontsReady: () => Promise.resolve(),
  composePrint: () => ({
    templateType: 'print',
    format: 'a6',
    slides: [{ elements: [] }],
  }),
}));
vi.mock('@gruenerator/canvas-editor/skeleton', () => ({
  CanvasEditorSkeleton: () => <div>lädt</div>,
}));
vi.mock('../image-studio/canvasQuery', () => ({ seedCanvasQuery: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const API = 'http://localhost/api';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: API, authMode: 'cookie' }));
});

const vorlage = { id: 'visitenkarte-1', titel: 'Visitenkarte', spec: {}, locale: 'de-DE' };

const canvasDocument = {
  id: 'canvas-9',
  title: 'Visitenkarte',
  created_by: 'u1',
  created_at: '2026-11-02T00:00:00Z',
  updated_at: '2026-11-02T00:00:00Z',
  permissions: null,
  is_public: false,
  template_type: 'print',
  base_template_id: null,
  thumbnail_url: null,
  page_count: 1,
  initial_state: {},
  format: 'a6',
};

function Where() {
  return <p>{useLocation().pathname}</p>;
}

function renderAt(id: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/studio/druck/${id}`]}>
        <Routes>
          <Route path="/studio/druck/:id" element={<PrintVorlageInstantiatePage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PrintVorlageInstantiatePage', () => {
  it('known id composes and navigates to /studio/canvas/<id>', async () => {
    server.use(
      http.get(`${API}/sharepic-vorlagen/print`, () => HttpResponse.json({ vorlagen: [vorlage] })),
      http.post(`${API}/canvas`, () => HttpResponse.json(canvasDocument, { status: 201 }))
    );
    renderAt('visitenkarte-1');
    expect(await screen.findByText('/studio/canvas/canvas-9')).toBeInTheDocument();
  });

  it('unknown id shows „Diese Vorlage gibt es nicht (mehr).“ with a link to /vorlagen', async () => {
    server.use(
      http.get(`${API}/sharepic-vorlagen/print`, () => HttpResponse.json({ vorlagen: [vorlage] }))
    );
    renderAt('gibt-es-nicht');
    expect(await screen.findByText('Diese Vorlage gibt es nicht (mehr).')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Zu den Vorlagen' })).toHaveAttribute(
        'href',
        '/vorlagen'
      )
    );
  });
});
