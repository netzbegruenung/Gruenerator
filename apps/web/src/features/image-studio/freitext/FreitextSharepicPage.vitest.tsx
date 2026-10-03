import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { act, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore, type User } from '../../../stores/authStore';
import { server } from '../../../test/msw-server';

import { saveCreatorSession } from './creatorSession';
import FreitextSharepicPage from './FreitextSharepicPage';

vi.mock('@gruenerator/canvas-editor/composer', () => ({
  composeSharepic: () => ({ templateType: 'freeform', slides: [{}] }),
  applySharepicPatch: (spec: unknown) => ({ spec }),
  ensureFontsReady: () => Promise.resolve(),
}));
vi.mock('../renderSharepicToImage', () => ({
  renderSharepicToImage: () => Promise.resolve('data:image/png;base64,AA'),
}));
vi.mock('./photoTone', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  primePhotoTones: () => Promise.resolve(),
}));
// The thread is the shared chat UI; what is under test is the hand-over, not the thread.
vi.mock('./SharepicCreatorChat', () => ({
  WORKING: {},
  SharepicCreatorChat: ({ messages }: { messages: { id: number; text: string }[] }) => (
    <ul aria-label="Unterhaltung-Stub">
      {messages.map((m) => (
        <li key={m.id}>{m.text}</li>
      ))}
    </ul>
  ),
}));

const DRAFT = 'http://localhost/api/sharepic-creator/draft';
const REVIEW = 'http://localhost/api/sharepic-creator/review';

const analysis = {
  motiv: 'Infostand',
  personen: 2,
  ruhigeSeite: 'oben' as const,
  hell: true,
  eignung: 'vollflaeche' as const,
  stichworte: ['Markt'],
  analysiert: true,
};
const photo = {
  name: 'foto-1.jpg',
  origin: 'own',
  url: `/api/share/${'1'.repeat(32)}/download`,
  analysis,
};

let bodies: { prompt: string; photos?: { id: string }[] }[];

function Probe({ id = 'probe' }: { id?: string }) {
  const location = useLocation();
  return <p data-testid={id}>{`${location.pathname} ${JSON.stringify(location.state)}`}</p>;
}

function renderAt(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/studio/freitext', state }]}>
      <Routes>
        <Route
          path="/studio/freitext"
          element={
            <>
              <FreitextSharepicPage />
              <Probe id="here" />
            </>
          }
        />
        <Route path="/bild-editor" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});
beforeEach(() => {
  bodies = [];
  localStorage.clear();
  useAuthStore.setState({ isLoading: false, user: { id: 'user-1' } as User });
  server.use(
    http.post(DRAFT, async ({ request }) => {
      bodies.push((await request.json()) as (typeof bodies)[number]);
      return HttpResponse.json({
        spec: {
          locale: 'de-DE',
          slides: [
            {
              background: { kind: 'foto', filename: 'upload:1', textSeite: 'unten' },
              position: 'unten',
              align: 'links',
              items: [{ type: 'headline', lines: ['Mach mit', 'bei uns!'] }],
              logo: true,
            },
          ],
        },
        chapters: [],
        attributions: [null],
      });
    }),
    http.post(REVIEW, () => HttpResponse.json({ ok: true, issues: [], patch: [] }))
  );
});
afterEach(() => server.resetHandlers());

describe('FreitextSharepicPage', () => {
  it('sends the first draft with the prompt and photos handed over from the Bild-Editor', async () => {
    renderAt({ prompt: 'Sharepic zum Infostand', photos: [photo] });
    await waitFor(() => expect(screen.getByAltText('Vorschau des Sharepics')).toBeInTheDocument());
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      prompt: 'Sharepic zum Infostand',
      photos: [{ id: 'upload:1', analysis }],
    });
    // Replaced right away: no hand-over left in the entry to resend on reload.
    expect(screen.getByTestId('here')).toHaveTextContent('/studio/freitext null');
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
  });

  it('starts a draft from a photo alone', async () => {
    renderAt({ prompt: '', photos: [photo] });
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]!.prompt).toContain('Sharepic aus meinem Foto');
  });

  it('opens the Bild-Editor in Sharepic mode when nothing was handed over', async () => {
    renderAt();
    expect(await screen.findByTestId('probe')).toHaveTextContent(
      '/bild-editor {"mode":"sharepic"}'
    );
    expect(bodies).toHaveLength(0);
  });

  it('resumes the last session after a reload instead of opening the Bild-Editor', async () => {
    saveCreatorSession({
      userId: 'user-1',
      messages: [
        { id: 0, role: 'user', text: 'Sharepic zum Infostand', error: false },
        { id: 1, role: 'assistant', text: 'Hier ist dein Entwurf.', error: false },
      ],
      spec: {
        locale: 'de-DE',
        format: 'post-portrait-tall',
        slides: [
          {
            background: { kind: 'farbe', color: 'tanne' },
            position: 'unten',
            align: 'links',
            items: [{ type: 'headline', lines: ['Mach mit'] }],
            logo: true,
          },
        ],
      },
      attributions: [null],
      brief: 'Sharepic zum Infostand',
      photos: [],
    });
    renderAt();
    expect(await screen.findByText('Hier ist dein Entwurf.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText('Vorschau des Sharepics')).toBeInTheDocument());
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it('waits for the account before deciding there is nothing to resume', async () => {
    useAuthStore.setState({ isLoading: true, user: null });
    saveCreatorSession({
      userId: 'user-1',
      messages: [{ id: 0, role: 'user', text: 'Sharepic zum Infostand', error: false }],
      spec: null,
      attributions: [],
      brief: 'Sharepic zum Infostand',
      photos: [],
    });
    renderAt();
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
    act(() => useAuthStore.setState({ isLoading: false, user: { id: 'user-1' } as User }));
    expect(await screen.findByText('Sharepic zum Infostand')).toBeInTheDocument();
  });

  it('starts a new session on a new hand-over, replacing the stored one', async () => {
    saveCreatorSession({
      userId: 'user-1',
      messages: [{ id: 0, role: 'user', text: 'Alte Sitzung', error: false }],
      spec: null,
      attributions: [],
      brief: 'Alte Sitzung',
      photos: [],
    });
    // The first draft is still running: a reload now must not bring the old session back.
    server.use(http.post(DRAFT, () => new Promise<never>(() => {})));
    renderAt({ prompt: 'Neue Sitzung', photos: [] });
    expect(await screen.findByText('Neue Sitzung')).toBeInTheDocument();
    expect(screen.queryByText('Alte Sitzung')).not.toBeInTheDocument();
    expect(localStorage.getItem('gruenerator-sharepic-creator-v1')).toBeNull();
  });
});
