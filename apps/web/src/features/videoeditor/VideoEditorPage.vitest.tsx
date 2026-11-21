import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { StrictMode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../test/msw-server';

import VideoEditorPage, {
  BETA_NOTICE_SEEN_KEY,
  VIDEO_EDITOR_APP_PATH,
  VIDEO_EDITOR_HOST_GLOBAL,
  type VideoEditorHost,
} from './VideoEditorPage';

import { axe, renderWithProviders, screen, waitFor } from '@/test-utils';

const CREATE = 'http://localhost/api/video-projects';

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{pathname + search}</div>;
}

function render(route = '/studio/videoeditor/s-abc123') {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/studio/videoeditor" element={<VideoEditorPage />} />
        <Route path="/studio/videoeditor/:slug" element={<VideoEditorPage />} />
      </Routes>
      <LocationProbe />
    </>,
    { route }
  );
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

const project = (slug: string) => ({
  project: {
    id: '00000000-0000-4000-8000-000000000001',
    slug,
    title: 'Neues Video',
    aspect_ratio: '9:16',
    created_at: '2026-11-21T10:00:00.000Z',
    updated_at: '2026-11-21T10:00:00.000Z',
    can_edit: true,
  },
  created: true,
});

describe('VideoEditorPage', () => {
  beforeEach(() => {
    localStorage.setItem(BETA_NOTICE_SEEN_KEY, '1');
  });

  it('embeds the editor app under its own path with an accessible name', async () => {
    const { container } = render();
    const frame = screen.getByTitle('Grünerator Video-Editor');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', '/videoeditor/app/?projekt=s-abc123');
    expect(VIDEO_EDITOR_APP_PATH).toBe('/videoeditor/app/');
    // The frame's content is a separate app; jsdom cannot message into it.
    expect(await axe(container, { iframes: false })).toHaveNoViolations();
  });

  it('shows the beta notice on the first visit only', async () => {
    localStorage.removeItem(BETA_NOTICE_SEEN_KEY);
    const { unmount } = render();

    const dialog = screen.getByRole('dialog', { name: 'Der neue Video-Editor' });
    expect(await axe(dialog)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('button', { name: "Los geht's" }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(BETA_NOTICE_SEEN_KEY)).toBe('1');

    unmount();
    render();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers the editor in the iframe a host while mounted', () => {
    const slot = window as unknown as Record<string, VideoEditorHost | undefined>;
    const { unmount } = render();
    const host = slot[VIDEO_EDITOR_HOST_GLOBAL];
    expect(typeof host?.saveFile).toBe('function');
    expect(typeof host?.close).toBe('function');
    expect(host?.inApp).toBe(false);
    unmount();
    expect(slot[VIDEO_EDITOR_HOST_GLOBAL]).toBeUndefined();
  });

  describe('without a project slug', () => {
    it('creates a project once (also under StrictMode) and moves to its slug route', async () => {
      const bodies: unknown[] = [];
      server.use(
        http.post(CREATE, async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json(project('s-abc123'), { status: 201 });
        })
      );
      renderWithProviders(
        <StrictMode>
          <Routes>
            <Route path="/studio/videoeditor" element={<VideoEditorPage />} />
            <Route path="/studio/videoeditor/:slug" element={<VideoEditorPage />} />
          </Routes>
          <LocationProbe />
        </StrictMode>,
        { route: '/studio/videoeditor' }
      );
      expect(screen.getByRole('status')).toHaveTextContent('Projekt wird angelegt');
      expect(screen.queryByTitle('Grünerator Video-Editor')).toBeNull();
      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent('/studio/videoeditor/s-abc123')
      );
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toEqual({});
    });

    it('sends source_ref for a KI-Schnitt hand-off and keeps the query', async () => {
      let body: unknown = null;
      server.use(
        http.post(CREATE, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(project('s-abc123'), { status: 201 });
        })
      );
      render('/studio/videoeditor?ki=k&v=3');
      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent(
          '/studio/videoeditor/s-abc123?ki=k&v=3'
        )
      );
      expect(body).toEqual({ source_ref: 'ki:k:3' });
    });

    it('shows an error with a way back and no frame when creating fails', async () => {
      server.use(http.post(CREATE, () => HttpResponse.json({ error: 'x' }, { status: 500 })));
      render('/studio/videoeditor');
      expect(await screen.findByText('Das Projekt konnte nicht angelegt werden.')).toBeVisible();
      expect(screen.getByRole('link', { name: 'Zurück zum Studio' })).toHaveAttribute(
        'href',
        '/studio'
      );
      expect(screen.queryByTitle('Grünerator Video-Editor')).toBeNull();
    });

    it('retries creating with one POST per attempt and then moves to the slug route', async () => {
      let posts = 0;
      server.use(
        http.post(CREATE, () => {
          posts += 1;
          return posts === 1
            ? HttpResponse.json({ error: 'x' }, { status: 500 })
            : HttpResponse.json(project('s-abc123'), { status: 201 });
        })
      );
      render('/studio/videoeditor');
      await userEvent.click(await screen.findByRole('button', { name: 'Erneut versuchen' }));
      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent('/studio/videoeditor/s-abc123')
      );
      expect(posts).toBe(2);
    });
  });
});
