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
  it('uploads the file with the project id in one call — no second share request', async () => {
    let groupId: FormDataEntryValue | null = null;
    let shareCalls = 0;
    server.use(
      http.post('http://localhost/api/documents/upload-only', async ({ request }) => {
        groupId = (await request.formData()).get('groupId');
        return HttpResponse.json({
          success: true,
          message: 'ok',
          data: {
            id: 'doc-1',
            title: 'Foerderbescheid',
            filename: 'Foerderbescheid.pdf',
            status: 'uploaded',
          },
        });
      }),
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
    expect(screen.getByRole('button', { name: 'Datei hinzufügen' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await upload(container, user);
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(1));
    expect(groupId).toBe(GROUP);
    expect(shareCalls).toBe(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it('shows the server sentence when the project refuses the file', async () => {
    server.use(
      http.post('http://localhost/api/documents/upload-only', () =>
        HttpResponse.json(
          { success: false, message: 'Du kannst in diesem Projekt nichts anlegen.' },
          { status: 403 }
        )
      )
    );
    const onAdded = vi.fn();
    const onError = vi.fn();
    const { user, container } = renderWithProviders(
      <ProjectFileUploadButton groupId={GROUP} onAdded={onAdded} onError={onError} />
    );
    await upload(container, user);
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Du kannst in diesem Projekt nichts anlegen.')
    );
    expect(onAdded).not.toHaveBeenCalled();
  });
});
