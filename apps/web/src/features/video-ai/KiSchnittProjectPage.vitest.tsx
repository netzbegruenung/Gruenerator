import { type VideoAiProjectDto, videoAiProjectDtoSchema } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../test/msw-server';
import { axe, renderWithProviders, screen, waitFor } from '../../test-utils';

import KiSchnittProjectPage from './KiSchnittProjectPage';

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const base = videoAiProjectDtoSchema.parse({
  id: ID(1),
  slugSuffix: 'abc123',
  title: 'Statement Radweg Sauerlacher Straße',
  status: 'queued',
  error: null,
  brief: {
    title: 'Statement Radweg Sauerlacher Straße',
    format: '9:16',
    style: 'talking-head-dynamisch',
  },
  inputs: [{ id: 'c1', mediaId: ID(9), role: 'footage', title: 'IMG_4411.mov' }],
  warnings: [],
  version: null,
  edl: null,
  versions: [],
  omitted: [],
  rationale: null,
  handedOff: false,
  createdAt: '2026-11-18T09:00:00.000Z',
});

const ready = videoAiProjectDtoSchema.parse({
  ...base,
  slugSuffix: 'ready1',
  status: 'ready',
  warnings: ['„IMG_4412.mov“ ist über weite Strecken unscharf.'],
  version: 2,
  edl: {
    version: 1,
    format: '9:16',
    segments: [{ unitId: 'c1.s5' }, { unitId: 'c1.s6' }],
    captions: { enabled: true, template: 'tanne' },
    overlays: [{ kind: 'logo', placement: 'ecke' }],
    music: null,
  },
  versions: [
    { version: 1, summary: 'Erster Schnitt', createdAt: base.createdAt },
    { version: 2, summary: 'Intro kürzer', createdAt: base.createdAt },
  ],
  omitted: [
    { unitId: 'c1.s1', text: 'Okay, läuft die Kamera?', reason: 'Gerede vor der Aufnahme' },
  ],
  rationale: 'Der stärkste Satz steht als Hook vorn.',
});

const active = videoAiProjectDtoSchema.parse({
  ...base,
  id: ID(3),
  slugSuffix: 'active1',
  status: 'analyzing',
});

const failed = videoAiProjectDtoSchema.parse({
  ...base,
  id: ID(4),
  slugSuffix: 'failed1',
  status: 'failed',
  error: 'In den Videos wird nichts gesprochen.',
});

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function serve(project: VideoAiProjectDto) {
  const parsed = videoAiProjectDtoSchema.parse(project);
  server.use(
    http.get('http://localhost/api/video-ai/projects/:ref', () => HttpResponse.json(parsed))
  );
}

function render(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/studio/ki-schnitt/:slug" element={<KiSchnittProjectPage />} />
    </Routes>,
    { route }
  );
}

describe('KiSchnittProjectPage', () => {
  it('trashes a failed project and shows no empty error line', async () => {
    serve({ ...failed, error: null });
    const removed: string[] = [];
    server.use(
      http.delete('http://localhost/api/video-ai/projects/:id', ({ params }) => {
        removed.push(String(params.id));
        return HttpResponse.json({ success: true });
      })
    );
    const { container, user } = render('/studio/ki-schnitt/failed1');
    const trash = await screen.findByRole('button', { name: 'In den Papierkorb' });
    expect(screen.getByRole('alert').querySelectorAll('p:empty')).toHaveLength(0);
    expect(await axe(container)).toHaveNoViolations();
    await user.click(trash);
    await waitFor(() => expect(removed).toEqual([failed.id]));
  });

  it('shows a cancelled project as a status, not as an error', async () => {
    serve({ ...failed, id: ID(5), slugSuffix: 'cancel1', status: 'cancelled', error: null });
    const { container } = render('/studio/ki-schnitt/cancel1');
    expect(await screen.findByRole('heading', { name: 'Abgebrochen' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Abgebrochen');
    expect(screen.getByRole('button', { name: 'In den Papierkorb' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Neuen KI-Schnitt anlegen' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('marks the running step while the worker is cutting', async () => {
    serve({ ...active, status: 'cutting' });
    const { container } = render('/studio/ki-schnitt/active1');
    expect(await screen.findByText('Schneiden')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Sichten')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Gestalten')).not.toHaveAttribute('aria-current');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('marks no step while the project is still queued', async () => {
    serve({ ...active, status: 'queued' });
    render('/studio/ki-schnitt/active1');
    await screen.findByText('Sichten');
    for (const step of ['Sichten', 'Schneiden', 'Gestalten']) {
      expect(screen.getByText(step)).not.toHaveAttribute('aria-current');
    }
  });

  it('keeps the section headings below the page title and passes axe', async () => {
    serve(ready);
    const { container } = render('/studio/ki-schnitt/ready1');
    const h2 = await screen.findByRole('heading', { level: 2, name: 'Rausgeschnitten' });
    expect(h2.className).toContain('text-lg');
    expect(screen.getByRole('heading', { level: 2, name: 'Hinweise zum Material' })).toHaveClass(
      'sr-only'
    );
    expect(screen.getByText('So hat die KI geschnitten')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In den Papierkorb' })).toBeInTheDocument();
    // The preview iframe points at the separate editor app, which jsdom does not load;
    // axe would try to message into it ("Respondable target must be a frame").
    expect(await axe(container, { iframes: false })).toHaveNoViolations();
  });
});
