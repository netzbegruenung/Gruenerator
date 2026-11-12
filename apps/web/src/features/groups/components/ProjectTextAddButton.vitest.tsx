import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test-utils';

import { ProjectTextAddButton } from './ProjectTextAddButton';

const GROUP = 'g1';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

async function fillAndSubmit(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.click(screen.getByRole('button', { name: 'Text hinzufügen' }));
  await user.type(screen.getByRole('textbox', { name: 'Titel des Textes' }), 'Förderbedingungen');
  await user.type(screen.getByRole('textbox', { name: 'Text' }), 'Gefördert werden 40 Prozent.');
  await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
}

describe('ProjectTextAddButton', () => {
  it('creates the document, then shares it into the project as a document', async () => {
    let created: unknown = null;
    let shared: unknown = null;
    server.use(
      http.post('http://localhost/api/documents/add-text', async ({ request }) => {
        created = await request.json();
        return HttpResponse.json({
          success: true,
          data: { id: 'doc-9', title: 'Förderbedingungen' },
        });
      }),
      http.post(`http://localhost/api/auth/groups/${GROUP}/share`, async ({ request }) => {
        shared = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    const onAdded = vi.fn();
    const onError = vi.fn();
    const { user } = renderWithProviders(
      <ProjectTextAddButton groupId={GROUP} onAdded={onAdded} onError={onError} />
    );

    await fillAndSubmit(user);

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(created).toEqual({
      title: 'Förderbedingungen',
      content: 'Gefördert werden 40 Prozent.',
    });
    expect(shared).toMatchObject({ contentType: 'documents', contentId: 'doc-9' });
    expect(onError).not.toHaveBeenCalled();
  });

  it('shares nothing when the text could not be created', async () => {
    let shareCalls = 0;
    server.use(
      http.post('http://localhost/api/documents/add-text', () =>
        HttpResponse.json({ success: false, message: 'kaputt' }, { status: 500 })
      ),
      http.post(`http://localhost/api/auth/groups/${GROUP}/share`, () => {
        shareCalls += 1;
        return HttpResponse.json({ success: true });
      })
    );
    const onAdded = vi.fn();
    const onError = vi.fn();
    const { user } = renderWithProviders(
      <ProjectTextAddButton groupId={GROUP} onAdded={onAdded} onError={onError} />
    );

    await fillAndSubmit(user);

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onAdded).not.toHaveBeenCalled();
    expect(shareCalls).toBe(0);
  });
});
