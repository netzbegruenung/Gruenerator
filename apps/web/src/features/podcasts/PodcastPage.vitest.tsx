/**
 * The page has four faces: in progress (polling), failed (with retry), ready
 * (player, download, transcript) and ready-but-deleted in the Mediathek.
 * The player's controls are hand-labelled, so axe runs on the ready branch.
 */
import { type PodcastDto } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../test/msw-server';

import PodcastPage from './PodcastPage';

import { axe, renderWithProviders, screen } from '@/test-utils';

const ID = '11111111-1111-4111-8111-111111111111';
const ENDPOINT = `http://localhost/api/podcasts/${ID}`;

const base: PodcastDto = {
  id: ID,
  title: 'Schwammstadt kurz erklärt',
  status: 'ready',
  error: null,
  script: {
    turns: [
      { speaker: 'a', text: 'Was ist eigentlich eine Schwammstadt?' },
      { speaker: 'b', text: 'Eine Stadt, die Regen wie ein Schwamm aufnimmt.' },
    ],
  },
  durationSeconds: 165,
  mediaId: '22222222-2222-4222-8222-222222222222',
  shareToken: 'tok123',
  voices: { a: '1930', b: '1885' },
  createdAt: '2026-10-10T10:00:00.000Z',
};

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

function renderPage(podcast: PodcastDto | null) {
  server.use(
    http.get(ENDPOINT, () =>
      podcast ? HttpResponse.json(podcast) : HttpResponse.json({ error: 'x' }, { status: 404 })
    )
  );
  return renderWithProviders(
    <Routes>
      <Route path="/podcast/:id" element={<PodcastPage />} />
    </Routes>,
    { route: `/podcast/${ID}` }
  );
}

describe('PodcastPage', () => {
  it('shows player, download and transcript when ready, and passes axe', async () => {
    const { container } = renderPage(base);

    expect(await screen.findByRole('heading', { level: 1, name: base.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abspielen' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Position' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MP3 herunterladen/ })).toBeInTheDocument();
    expect(screen.getByText('Was ist eigentlich eine Schwammstadt?')).toBeInTheDocument();
    expect(screen.getAllByText('Moderation')).toHaveLength(1);
    expect(container.querySelector('audio')?.getAttribute('src')).toContain('/share/tok123/stream');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the progress while the worker voices it', async () => {
    renderPage({
      ...base,
      status: 'voicing',
      mediaId: null,
      shareToken: null,
      durationSeconds: null,
    });

    expect(await screen.findByText('Dein Podcast wird erstellt …')).toBeInTheDocument();
    expect(screen.getByText('Stimmen werden aufgenommen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abspielen' })).not.toBeInTheDocument();
  });

  it('shows the server sentence and a retry when it failed', async () => {
    renderPage({
      ...base,
      status: 'failed',
      error: 'Für heute sind keine Bäume mehr übrig.',
      mediaId: null,
      shareToken: null,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Für heute sind keine Bäume mehr übrig.'
    );
    expect(screen.getByRole('button', { name: /Neu versuchen/ })).toBeInTheDocument();
  });

  it('keeps the transcript when the audio was deleted in the Mediathek', async () => {
    renderPage({ ...base, mediaId: null, shareToken: null });

    expect(await screen.findByText(/in der Mediathek gelöscht/)).toBeInTheDocument();
    expect(screen.getByText('Eine Stadt, die Regen wie ein Schwamm aufnimmt.')).toBeInTheDocument();
  });

  it('says so when the podcast does not exist', async () => {
    renderPage(null);
    expect(
      await screen.findByRole('heading', { name: 'Podcast nicht gefunden' })
    ).toBeInTheDocument();
  });
});
