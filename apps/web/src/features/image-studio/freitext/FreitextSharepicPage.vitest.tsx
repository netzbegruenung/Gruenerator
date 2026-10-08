import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore, type User } from '../../../stores/authStore';
import { server } from '../../../test/msw-server';
import { axe } from '../../../test-utils';

import { saveCreatorSession } from './creatorSession';
import FreitextSharepicPage from './FreitextSharepicPage';

const slideCount = vi.hoisted(() => ({ value: 1 }));
vi.mock('@gruenerator/canvas-editor/composer', () => ({
  composeSharepic: () => ({
    templateType: 'freeform',
    slides: Array.from({ length: slideCount.value }, () => ({})),
  }),
  applySharepicPatch: (spec: unknown) => ({ spec }),
  applySharepicTweaks: (spec: unknown) => spec,
  sharepicTweaks: () => [],
  ensureFontsReady: () => Promise.resolve(),
}));
vi.mock('../renderSharepicToImage', () => ({
  renderSharepicToImage: () => Promise.resolve('data:image/png;base64,AA'),
}));
// jsdom never loads an <img>: a carousel's contact sheet would wait forever.
vi.mock('./creatorRender', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  contactSheet: (previews: string[]) => Promise.resolve(previews.length === 1 ? previews[0] : null),
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

const DRAFT_RESPONSE = () => ({
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
  slideCount.value = 1;
  bodies = [];
  localStorage.clear();
  useAuthStore.setState({ isLoading: false, user: { id: 'user-1' } as User });
  server.use(
    http.post(DRAFT, async ({ request }) => {
      bodies.push((await request.json()) as (typeof bodies)[number]);
      return HttpResponse.json(DRAFT_RESPONSE());
    }),
    http.post(REVIEW, () => HttpResponse.json({ ok: true, issues: [], patch: [] }))
  );
});
afterEach(() => server.resetHandlers());

describe('FreitextSharepicPage', () => {
  it('names a carousel’s previews as Folien', async () => {
    slideCount.value = 2;
    renderAt({ prompt: 'Karussell zum Infostand' });
    await waitFor(() => expect(screen.getByAltText('Folie 1 von 2')).toBeInTheDocument());
    expect(screen.getByAltText('Folie 2 von 2')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Folien des Karussells' })).toBeInTheDocument();
  });

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
    // At md and above the preview is the one main landmark.
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toContainElement(
      screen.getByAltText('Vorschau des Sharepics')
    );
    // Below md the restored design opens on the preview tab.
    expect(screen.getByRole('tab', { name: 'Vorschau', hidden: true })).toHaveAttribute(
      'aria-selected',
      'true'
    );
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

describe('FreitextSharepicPage below md', () => {
  const desktopWidth = window.innerWidth;
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: desktopWidth, configurable: true });
  });

  function holdDraft() {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = DRAFT_RESPONSE();
    server.use(
      http.post(DRAFT, async () => {
        await gate;
        return HttpResponse.json(real);
      })
    );
    return () => release();
  }

  it('shows chat and preview as tabs, keeping the hidden panel mounted', async () => {
    const release = holdDraft();
    renderAt({ prompt: 'Sharepic zum Infostand', photos: [photo] });
    const tablist = await screen.findByRole('tablist', { name: 'Ansicht' });
    const chat = within(tablist).getByRole('tab', { name: 'Chat' });
    const vorschau = within(tablist).getByRole('tab', { name: 'Vorschau' });
    expect(chat).toHaveAttribute('aria-selected', 'true');
    expect(vorschau).toHaveAttribute('aria-selected', 'false');
    expect(vorschau).toHaveAttribute('tabindex', '-1');

    const chatPanel = screen.getByRole('tabpanel', { name: 'Chat' });
    expect(chatPanel).toContainElement(screen.getByLabelText('Unterhaltung-Stub'));
    const previewPanel = document.getElementById('sharepic-panel-vorschau')!;
    expect(previewPanel).toHaveClass('max-md:hidden');
    expect(chatPanel).not.toHaveClass('max-md:hidden');

    fireEvent.click(vorschau);
    expect(vorschau).toHaveAttribute('aria-selected', 'true');
    expect(chatPanel).toHaveClass('max-md:hidden');
    expect(chatPanel).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Vorschau' })).not.toHaveClass('max-md:hidden');

    // The panels sit inside the one main landmark; neither panel is a second one.
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toContainElement(chatPanel);
    expect(await axe(tablist)).toHaveNoViolations();
    release();
  });

  it('moves between tabs with the arrow keys', async () => {
    const release = holdDraft();
    renderAt({ prompt: 'Sharepic zum Infostand', photos: [photo] });
    const chat = await screen.findByRole('tab', { name: 'Chat' });
    const vorschau = screen.getByRole('tab', { name: 'Vorschau' });
    chat.focus();
    fireEvent.keyDown(chat, { key: 'ArrowRight' });
    expect(vorschau).toHaveAttribute('aria-selected', 'true');
    expect(vorschau).toHaveFocus();
    expect(vorschau).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(vorschau, { key: 'ArrowLeft' });
    expect(chat).toHaveAttribute('aria-selected', 'true');
    expect(chat).toHaveFocus();
    release();
  });

  it('opens the preview once a turn has produced a design', async () => {
    renderAt({ prompt: 'Sharepic zum Infostand', photos: [photo] });
    await waitFor(() => expect(screen.getByAltText('Vorschau des Sharepics')).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Vorschau' })).toHaveAttribute('aria-selected', 'true')
    );
    expect(document.getElementById('sharepic-panel-chat')).toHaveClass('max-md:hidden');
  });
});
