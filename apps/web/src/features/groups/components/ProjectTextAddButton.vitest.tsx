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
  it('creates the text with the project id in one call — no second share request', async () => {
    let created: unknown = null;
    let shareCalls = 0;
    server.use(
      http.post('http://localhost/api/documents/add-text', async ({ request }) => {
        created = await request.json();
        return HttpResponse.json({
          success: true,
          data: { id: 'doc-9', title: 'Förderbedingungen' },
        });
      }),
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

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(created).toEqual({
      title: 'Förderbedingungen',
      content: 'Gefördert werden 40 Prozent.',
      groupId: GROUP,
    });
    expect(shareCalls).toBe(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it('shows the server sentence when the project refuses the text', async () => {
    server.use(
      http.post('http://localhost/api/documents/add-text', () =>
        HttpResponse.json(
          { success: false, message: 'Du kannst in diesem Projekt nichts anlegen.' },
          { status: 403 }
        )
      )
    );
    const onAdded = vi.fn();
    const onError = vi.fn();
    const { user } = renderWithProviders(
      <ProjectTextAddButton groupId={GROUP} onAdded={onAdded} onError={onError} />
    );

    await fillAndSubmit(user);

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Du kannst in diesem Projekt nichts anlegen.')
    );
    expect(onAdded).not.toHaveBeenCalled();
  });
});
