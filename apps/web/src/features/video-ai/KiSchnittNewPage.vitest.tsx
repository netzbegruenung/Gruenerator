import { type VideoAiProjectListItem, videoAiProjectListItemSchema } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../test/msw-server';
import { axe, renderWithProviders, screen, within } from '../../test-utils';

import KiSchnittNewPage from './KiSchnittNewPage';

const ID = '00000000-0000-4000-8000-000000000001';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function serveList(projects: VideoAiProjectListItem[]) {
  const parsed = projects.map((p) => videoAiProjectListItemSchema.parse(p));
  server.use(
    http.get('http://localhost/api/video-ai/projects', () =>
      HttpResponse.json({ projects: parsed })
    )
  );
}

describe('KiSchnittNewPage', () => {
  it('lists earlier projects with a short status and their date', async () => {
    const createdAt = '2026-11-18T09:00:00.000Z';
    serveList([{ id: ID, slugSuffix: 'a1', title: 'Radweg', status: 'analyzing', createdAt }]);
    const { container } = renderWithProviders(<KiSchnittNewPage />, {
      route: '/studio/ki-schnitt',
    });
    const row = (await screen.findByRole('link', { name: 'Radweg' })).closest('li')!;
    expect(within(row).getByText('Läuft')).toBeInTheDocument();
    // ICU data decides between "18. Nov." and "18. Nov" — ask the same API the page asks.
    const date = new Date(createdAt).toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'short',
    });
    expect(within(row).getByText(date)).toBeInTheDocument();
    expect(within(row).queryByText(/gesichtet/)).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });
});
