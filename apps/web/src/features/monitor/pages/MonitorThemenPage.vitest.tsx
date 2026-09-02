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

    expect(await screen.findByText('Zitat [1]')).toBeInTheDocument();
    expect(screen.getByText('Grundsatzprogramm')).toBeInTheDocument();
    expect(screen.getByText(/Ein Beispielzitat aus dem Programm\./)).toBeInTheDocument();
  });

  it('does not render the modal when no citation is selected', async () => {
    server.use(http.get(LATEST_ENDPOINT, () => HttpResponse.json(null, { status: 404 })));

    renderPage();

    expect(screen.queryByText(/^Zitat \[/)).not.toBeInTheDocument();
  });
});
