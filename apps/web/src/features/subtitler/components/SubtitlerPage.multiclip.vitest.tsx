import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/authStore';
import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test-utils';

vi.mock('../../../components/common/LoginRequired/withAuthRequired', () => ({
  default: (Component: unknown) => Component,
}));
vi.mock('../../../utils/tusAuth', () => ({ getTusAuthOptions: () => Promise.resolve({}) }));
vi.mock('../utils/videoUtils', () => ({
  TUS_UPLOAD_ENDPOINT: 'http://localhost/api/subtitler/upload',
  getVideoMetadata: () => Promise.resolve({ duration: 4.5, width: 1080, height: 1920 }),
}));
// Every upload succeeds at once; the id is taken from the file name.
vi.mock('tus-js-client', () => ({
  Upload: class {
    url: string;
    file: File;
    private onSuccess: () => void;
    constructor(file: File, opts: { onSuccess: () => void }) {
      this.file = file;
      this.url = `http://localhost/api/subtitler/upload/${file.name}`;
      this.onSuccess = opts.onSuccess;
    }
    start() {
      this.onSuccess();
    }
    abort() {}
  },
}));
// The server joined both clips and saved the project as p1.
vi.mock('./AutoProcessingScreen', () => ({
  default: ({ onComplete }: { onComplete: (r: unknown) => void }) => (
    <button
      onClick={() =>
        onComplete({
          projectId: 'p1',
          segments: [{ text: 'Zweiter Clip', startTime: 6, endTime: 8 }],
        })
      }
    >
      fertig
    </button>
  ),
}));
vi.mock('./VideoSuccessScreen', () => ({
  default: ({ onEditAgain }: { onEditAgain: () => void }) => (
    <button onClick={onEditAgain}>Bearbeiten</button>
  ),
}));
vi.mock('./SubtitleEditor', () => ({
  default: ({ videoUrl }: { videoUrl?: string }) => <p>Vorschau {videoUrl ?? 'lokal'}</p>,
}));

const { default: SubtitlerPage } = await import('./SubtitlerPage');

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1' } } as never);
  server.use(
    http.post('http://localhost/api/subtitler/process-auto', () =>
      HttpResponse.json({ status: 'processing', uploadId: 'a.mp4' }, { status: 202 })
    )
  );
});

const clip = (name: string) => new File(['x'], name, { type: 'video/mp4' });

describe('SubtitlerPage with several clips from /video', () => {
  it('previews the joined project video, not the first local clip (#6037)', async () => {
    const { user } = renderWithProviders(<SubtitlerPage />, {
      route: {
        pathname: '/studio/video',
        state: { videoStartFiles: [clip('a.mp4'), clip('b.mp4')] },
      },
    });

    await user.click(await screen.findByRole('button', { name: 'fertig' }));
    await user.click(await screen.findByRole('button', { name: 'Bearbeiten' }));

    expect(
      await screen.findByText('Vorschau /api/subtitler/projects/p1/video')
    ).toBeInTheDocument();
  });

  it('keeps the local file for a single clip', async () => {
    const { user } = renderWithProviders(<SubtitlerPage />, {
      route: { pathname: '/studio/video', state: { videoStartFiles: [clip('a.mp4')] } },
    });

    await user.click(await screen.findByRole('button', { name: 'fertig' }));
    await user.click(await screen.findByRole('button', { name: 'Bearbeiten' }));

    expect(await screen.findByText('Vorschau lokal')).toBeInTheDocument();
  });
});
