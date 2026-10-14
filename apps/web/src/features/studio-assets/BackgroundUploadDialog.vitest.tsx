import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../test/msw-server';
import { renderWithProviders, screen, waitFor } from '../../test-utils';

import { BackgroundUploadDialog } from './BackgroundUploadDialog';

import type * as BackgroundImage from './backgroundImage';

const { uploadShare } = vi.hoisted(() => ({ uploadShare: vi.fn() }));

vi.mock('../image-studio/services/mediaUploadService', () => ({
  uploadBlobToMediaShare: uploadShare,
}));
// jsdom has no 2D canvas to scale the picture with.
vi.mock('./backgroundImage', async (importOriginal) => ({
  ...(await importOriginal<typeof BackgroundImage>()),
  prepareBackgroundImage: (file: File) => Promise.resolve(file),
}));

const API = 'http://localhost/api/studio-assets';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

describe('BackgroundUploadDialog', () => {
  it('retries a failed save with the file it already uploaded', async () => {
    uploadShare.mockResolvedValue('tok-1');
    const tokens: unknown[] = [];
    server.use(
      http.post(API, async ({ request }) => {
        tokens.push(((await request.json()) as { shareToken: unknown }).shareToken);
        return HttpResponse.json({ error: 'kaputt' }, { status: 500 });
      })
    );
    const { user } = renderWithProviders(
      <BackgroundUploadDialog
        onClose={() => {}}
        initialFile={new File(['raw'], 'Wiese.png', { type: 'image/png' })}
      />
    );
    await user.click(screen.getByLabelText('Unter „Entdecken“ öffentlich teilen'));
    const submit = screen.getByRole('button', { name: 'Speichern' });
    await user.click(submit);
    await waitFor(() => expect(tokens).toHaveLength(1));
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(tokens).toEqual(['tok-1', 'tok-1']));
    expect(uploadShare).toHaveBeenCalledOnce();
  });
});
