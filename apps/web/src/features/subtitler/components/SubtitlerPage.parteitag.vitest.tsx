import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/authStore';
import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test-utils';

// The auth wrapper is covered elsewhere; here the page itself is under test.
vi.mock('../../../components/common/LoginRequired/withAuthRequired', () => ({
  default: (Component: unknown) => Component,
}));
// Stand-in for the existing progress screen: it only has to receive the uploadId.
vi.mock('./AutoProcessingScreen', () => ({
  default: ({ uploadId }: { uploadId: string }) => <p>Fortschritt {uploadId}</p>,
}));

const { default: SubtitlerPage } = await import('./SubtitlerPage');

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1' } } as never);
});

describe('SubtitlerPage ?parteitagRede=', () => {
  it('starts processing and shows progress', async () => {
    let body: unknown = null;
    server.use(
      http.post('http://localhost/api/subtitler/process-parteitag', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ uploadId: 'parteitag-s1-abcd1234' }, { status: 202 });
      })
    );

    renderWithProviders(<SubtitlerPage />, { route: '/studio/video?parteitagRede=s1' });

    expect(await screen.findByText('Fortschritt parteitag-s1-abcd1234')).toBeInTheDocument();
    expect(body).toMatchObject({ speechId: 's1' });
  });

  it('shows "Quelle nicht mehr verfügbar" on 410', async () => {
    server.use(
      http.post('http://localhost/api/subtitler/process-parteitag', () =>
        HttpResponse.json(
          { code: 'SOURCE_GONE', error: 'Quelle nicht mehr verfügbar' },
          { status: 410 }
        )
      )
    );

    renderWithProviders(<SubtitlerPage />, { route: '/studio/video?parteitagRede=s1' });

    await waitFor(() =>
      expect(screen.getByText('Quelle nicht mehr verfügbar')).toBeInTheDocument()
    );
  });
});
