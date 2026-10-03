import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test-utils';

import { MonitorWatcherContent } from './MonitorWatcherPage';

const ENTITY_RESULTS = 'http://localhost/api/monitor/entities/:id';
const ENTITY_SUMMARY = 'http://localhost/api/monitor/entities/:id/summary';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => server.resetHandlers());

describe('MonitorWatcherPage', () => {
  it('lists the articles about the Greens and never asks for the AI summary', async () => {
    let summaryRequested = false;
    server.use(
      http.get(ENTITY_SUMMARY, () => {
        summaryRequested = true;
        return HttpResponse.json({ error: 'unused' }, { status: 500 });
      }),
      http.get(ENTITY_RESULTS, ({ params }) =>
        HttpResponse.json({
          entity: { id: params.id, label: 'Die Grünen' },
          count: 1,
          sources: ['Tagesschau'],
          articles: [
            {
              url: 'https://example.org/gruene',
              title: 'Grüne legen Klimaplan vor',
              source: 'Tagesschau',
              publishedAt: '2026-10-03T07:00:00Z',
              excerpt: 'Die Grünen haben heute …',
              locale: 'de',
              topics: {},
              primaryTopic: null,
            },
          ],
        })
      )
    );

    renderWithProviders(<MonitorWatcherContent />);

    expect(await screen.findByRole('heading', { name: 'Watcher' })).toBeInTheDocument();
    const card = await screen.findByRole('link', { name: /Grüne legen Klimaplan vor/ });
    expect(card).toHaveAttribute('href', 'https://example.org/gruene');
    expect(screen.getByText(/1 Artikel aus 1 Quellen/)).toBeInTheDocument();
    expect(screen.queryByText(/Zusammenfassung|Risiko/)).not.toBeInTheDocument();
    expect(summaryRequested).toBe(false);
  });
});
