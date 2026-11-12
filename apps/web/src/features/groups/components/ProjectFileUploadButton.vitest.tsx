import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';
import { axe, renderWithProviders } from '../../../test-utils';

import { ProjectFileUploadButton } from './ProjectFileUploadButton';

const GROUP = 'g1';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function upload(container: HTMLElement, user: ReturnType<typeof renderWithProviders>['user']) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  return user.upload(input, new File(['%PDF'], 'Foerderbescheid.pdf', { type: 'application/pdf' }));
}

describe('ProjectFileUploadButton', () => {
  it('uploads the file, then shares it into the project as a document', async () => {
    let shared: unknown = null;
    server.use(
      http.post('http://localhost/api/documents/upload-only', () =>
        HttpResponse.json({
          success: true,
          message: 'ok',
          data: {
            id: 'doc-1',
            title: 'Foerderbescheid',
            filename: 'Foerderbescheid.pdf',
            status: 'uploaded',
          },
        })
      ),
      http.post(`http://localhost/api/auth/groups/${GROUP}/share`, async ({ request }) => {
        shared = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    const onAdded = vi.fn();
    const onError = vi.fn();
    const { user, container } = renderWithProviders(
      <ProjectFileUploadButton groupId={GROUP} onAdded={onAdded} onError={onError} />
    );
    expect(screen.getByRole('button', { name: 'Datei hinzufügen' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await upload(container, user);
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(1));
    expect(shared).toMatchObject({ contentType: 'documents', contentId: 'doc-1' });
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a failed upload and shares nothing', async () => {
    let shareCalls = 0;
    server.use(
      http.post('http://localhost/api/documents/upload-only', () =>
        HttpResponse.json({ success: false, message: 'kaputt' }, { status: 415 })
      ),
      http.post(`http://localhost/api/auth/groups/${GROUP}/share`, () => {
        shareCalls += 1;
        return HttpResponse.json({ success: true });
      })
    );
    const onAdded = vi.fn();
    const onError = vi.fn();
    const { user, container } = renderWithProviders(
      <ProjectFileUploadButton groupId={GROUP} onAdded={onAdded} onError={onError} />
    );
    await upload(container, user);
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onAdded).not.toHaveBeenCalled();
    expect(shareCalls).toBe(0);
  });
});
