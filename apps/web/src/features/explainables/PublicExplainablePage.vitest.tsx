import { type ExplainableDto } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import PublicExplainablePage from './PublicExplainablePage';

import { server } from '@/test/msw-server';
import { axe, renderWithProviders } from '@/test-utils';

const TOKEN = 'a'.repeat(32);
const ENDPOINT = `http://localhost/api/explainables/shared/${TOKEN}`;

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/e/:token" element={<PublicExplainablePage />} />
    </Routes>,
    { route: `/e/${TOKEN}` }
  );
}

const dto: ExplainableDto = {
  id: '00000000-0000-4000-8000-000000000001',
  slugSuffix: 'abc123',
  title: 'Was ist das Klimageld?',
  status: 'ready',
  content: {
    title: 'Was ist das Klimageld?',
    summary: 'Das Klimageld gibt Einnahmen aus dem CO2-Preis zurück.',
    sections: [
      { heading: 'Woher kommt das Geld?', paragraphs: ['Vom CO2-Preis.'] },
      { heading: 'Wer bekommt es?', paragraphs: ['Alle.'] },
    ],
    keyTakeaways: ['Eins', 'Zwei'],
    sources: [],
  },
  shareMode: 'public',
  shareToken: null,
  isOwner: false,
  createdAt: '2026-10-09T10:00:00.000Z',
  updatedAt: '2026-10-09T10:00:00.000Z',
};

describe('PublicExplainablePage', () => {
  it('asks a guest to log in when the link is login-gated (401)', async () => {
    server.use(
      http.get(ENDPOINT, () =>
        HttpResponse.json({ error: 'auth', share_mode: 'authenticated' }, { status: 401 })
      )
    );
    const { container } = renderPage();
    expect(await screen.findByRole('heading', { name: 'Anmeldung nötig' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('says the link is no longer shared on 404', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json({ error: 'nf' }, { status: 404 })));
    renderPage();
    expect(
      await screen.findByText('Dieses Explainable ist nicht (mehr) geteilt.')
    ).toBeInTheDocument();
  });

  it('renders the explainable with a PDF button on success', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json(dto)));
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: dto.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Als PDF herunterladen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Erstellt mit dem Grünerator' })).toHaveAttribute(
      'href',
      '/'
    );
  });
});
