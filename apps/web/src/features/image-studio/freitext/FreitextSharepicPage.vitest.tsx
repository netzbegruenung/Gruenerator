import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';

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
});
