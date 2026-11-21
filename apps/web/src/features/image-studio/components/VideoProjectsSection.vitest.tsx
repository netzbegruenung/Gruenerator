import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';
import { axe, renderWithProviders, screen, waitFor } from '../../../test-utils';

import VideoProjectsSection from './VideoProjectsSection';

vi.mock('../../trash/trashUndoToast', () => ({ showTrashUndoToast: vi.fn() }));

const BASE = 'http://localhost/api';
const project = (id: string, title: string) => ({
  id,
  slug: `${title.toLowerCase()}-abc123`,
  title,
  aspect_ratio: '9:16',
  created_at: '2026-11-20T10:00:00.000Z',
  updated_at: '2026-11-20T10:00:00.000Z',
  can_edit: true,
});

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: BASE, authMode: 'cookie' }));
});

describe('VideoProjectsSection', () => {
  it('links each project to its editor route', async () => {
    server.use(
      http.get(`${BASE}/video-projects`, () =>
        HttpResponse.json([project('1', 'Eins'), project('2', 'Zwei')])
      )
    );
    renderWithProviders(<VideoProjectsSection />);
    const one = await screen.findByRole('link', { name: 'Eins' });
    expect(one.getAttribute('href')).toBe('/studio/videoeditor/eins-abc123');
    expect(screen.getByRole('link', { name: 'Zwei' }).getAttribute('href')).toBe(
      '/studio/videoeditor/zwei-abc123'
    );
    expect(screen.getByRole('heading', { name: 'Videoprojekte' })).toBeTruthy();
  });

  it('renders nothing for an empty list', async () => {
    let called = false;
    server.use(
      http.get(`${BASE}/video-projects`, () => {
        called = true;
        return HttpResponse.json([]);
      })
    );
    renderWithProviders(<VideoProjectsSection />);
    await waitFor(() => expect(called).toBe(true));
    expect(screen.queryByText('Videoprojekte')).toBeNull();
  });

  it('deletes a project and drops the card after the refetch', async () => {
    let items = [project('1', 'Eins'), project('2', 'Zwei')];
    const deleted: string[] = [];
    server.use(
      http.get(`${BASE}/video-projects`, () => HttpResponse.json(items)),
      http.delete(`${BASE}/video-projects/:id`, ({ params }) => {
        deleted.push(String(params.id));
        items = items.filter((p) => p.id !== params.id);
        return HttpResponse.json({ trashed: true });
      })
    );
    const { user } = renderWithProviders(<VideoProjectsSection />);
    await screen.findByRole('link', { name: 'Eins' });
    await user.click(screen.getAllByRole('button', { name: /Aktionen|Mehr|Menü/i })[0]);
    await user.click(await screen.findByRole('menuitem', { name: /Löschen/ }));
    await waitFor(() => expect(deleted).toEqual(['1']));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Eins' })).toBeNull());
    expect(screen.getByRole('link', { name: 'Zwei' })).toBeTruthy();
  });

  it('has no axe violations', async () => {
    server.use(http.get(`${BASE}/video-projects`, () => HttpResponse.json([project('1', 'Eins')])));
    const { container } = renderWithProviders(<VideoProjectsSection />);
    await screen.findByRole('link', { name: 'Eins' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
