import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import useCitationStore from '../../../stores/citationStore';
import { server } from '../../../test/msw-server';

import { MonitorThemenContent } from './MonitorThemenPage';

const LATEST_ENDPOINT = 'http://localhost/api/monitor/latest';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/themen']}>
        <Routes>
          <Route path="/themen" element={<MonitorThemenContent />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MonitorThemenPage — citation modal mount (issue #3130)', () => {
  afterEach(() => {
    server.resetHandlers();
    useCitationStore.setState({
      selectedCitation: null,
      contextData: null,
      contextError: null,
      isLoadingContext: false,
    });
  });

  it('renders the citation modal once a citation badge click has selected a citation', async () => {
    server.use(http.get(LATEST_ENDPOINT, () => HttpResponse.json(null, { status: 404 })));

    act(() => {
      useCitationStore.setState({
        selectedCitation: {
          index: 1,
          document_title: 'Grundsatzprogramm',
          cited_text: 'Ein Beispielzitat aus dem Programm.',
        },
      });
    });

    renderPage();

    // Die Rolle plus der zugängliche Name, nicht der blosse Text: das ist die
    // Aussage, um die es seit #3133 geht — und sie hält auch dann noch, wenn
    // jemand die Titel-Bausteine anders zusammensetzt. Dass Radix nach
    // document.body portaliert, stört nicht: RTLs `screen` fragt document.body ab.
    expect(
      await screen.findByRole('dialog', { name: /Zitat \[1\] — Grundsatzprogramm/ })
    ).toBeInTheDocument();
    expect(screen.getByText(/Ein Beispielzitat aus dem Programm\./)).toBeInTheDocument();
  });

  it('does not render the modal when no citation is selected', async () => {
    server.use(http.get(LATEST_ENDPOINT, () => HttpResponse.json(null, { status: 404 })));

    renderPage();

    // Radix rendert geschlossen nichts — kein Dialog, nicht bloss kein Text.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('MonitorThemenPage — Artikel zu den Top-Keywords', () => {
  afterEach(() => server.resetHandlers());

  it('lists the keyword-dense articles with the keywords they matched', async () => {
    server.use(
      http.get(LATEST_ENDPOINT, () =>
        HttpResponse.json({
          id: 's1',
          createdAt: '2026-10-03T08:00:00Z',
          topics: [],
          keywords: [{ keyword: 'Wehrpflicht', count: 12, topic: null }],
          socialTrends: [],
          totalArticles: 40,
          sources: ['Tagesschau'],
          articlesByLocale: { de: 40, at: 0 },
        })
      ),
      http.get('http://localhost/api/monitor/briefing', () =>
        HttpResponse.json({ error: 'none' }, { status: 404 })
      ),
      http.get('http://localhost/api/monitor/keyword-articles', () =>
        HttpResponse.json({
          keywords: ['Wehrpflicht', 'Bundeswehr'],
          articles: [
            {
              url: 'https://example.org/wehrpflicht',
              title: 'Streit um die Wehrpflicht',
              source: 'Tagesschau',
              publishedAt: '2026-10-03T07:00:00Z',
              excerpt: '',
              locale: 'de',
              topics: {},
              primaryTopic: null,
              matchedKeywords: ['Wehrpflicht', 'Bundeswehr'],
            },
          ],
        })
      )
    );

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Artikel zu den Top-Keywords' })
    ).toBeInTheDocument();
    const card = await screen.findByRole('link', { name: /Streit um die Wehrpflicht/ });
    expect(card).toHaveAttribute('href', 'https://example.org/wehrpflicht');
    expect(card).toHaveTextContent('Wehrpflicht · Bundeswehr');
  });
});
