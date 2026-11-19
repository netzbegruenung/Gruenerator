import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test-utils';

import AddContentToGroupModal from './AddContentToGroupModal';

const GROUP = 'g1';
const ME = 'user-me';

const doc = (id: string, title: string, createdBy = ME) => ({
  id,
  title,
  created_by: createdBy,
  document_subtype: 'docs',
  updated_at: '2026-11-19T10:00:00.000Z',
});

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  server.use(
    http.get('*/api/user-agents', () => HttpResponse.json({ agents: [] })),
    http.get('*/api/text-forms', () => HttpResponse.json({ forms: [] })),
    http.get('*/api/boards', () => HttpResponse.json([])),
    http.get('*/api/documents/user', () => HttpResponse.json({ success: true, data: [] })),
    http.get('*/api/auth/notebook-collections', () =>
      HttpResponse.json({ success: true, collections: [] })
    ),
    http.get('*/api/docs', () =>
      HttpResponse.json([
        doc('d-shared', 'Schon drin'),
        doc('d-new', 'Neuer Antrag'),
        doc('d-foreign', 'Von Lena', 'user-lena'),
      ])
    )
  );
});

function setup(onClose = vi.fn(), onAdded = vi.fn()) {
  const utils = renderWithProviders(
    <AddContentToGroupModal
      isOpen
      onClose={onClose}
      groupId={GROUP}
      sharedKeys={new Set(['collaborative_documents:d-shared'])}
      currentUserId={ME}
      onAdded={onAdded}
      initialCategory="collabDocs"
    />
  );
  return { ...utils, onClose, onAdded };
}

describe('AddContentToGroupModal', () => {
  it('marks items already in the project and hides other people’s docs', async () => {
    setup();

    const shared = await screen.findByRole('button', { name: /Schon drin/ });
    expect(shared).toBeDisabled();
    expect(shared).toHaveTextContent('Schon im Projekt');
    expect(screen.getByRole('button', { name: /Neuer Antrag/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Von Lena/ })).not.toBeInTheDocument();
  });

  it('keeps the dialog open and shows the server message when a share fails', async () => {
    server.use(
      http.post(`*/api/auth/groups/${GROUP}/share`, () =>
        HttpResponse.json(
          { success: false, message: 'Inhalt ist bereits mit diesem Projekt geteilt.' },
          { status: 400 }
        )
      )
    );
    const { user, onClose, onAdded } = setup();

    await user.click(await screen.findByRole('button', { name: /Neuer Antrag/ }));
    await user.click(screen.getByRole('button', { name: '1 hinzufügen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ein Inhalt wurde nicht hinzugefügt: Inhalt ist bereits mit diesem Projekt geteilt.'
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('shares read-only with the note, reports the count and closes', async () => {
    let body: unknown = null;
    server.use(
      http.post(`*/api/auth/groups/${GROUP}/share`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    const { user, onClose, onAdded } = setup();

    await user.click(await screen.findByRole('button', { name: /Neuer Antrag/ }));
    await user.type(screen.getByRole('textbox', { name: 'Notiz für die Gruppe' }), 'Bitte lesen');
    await user.click(screen.getByRole('button', { name: '1 hinzufügen' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onAdded).toHaveBeenCalledWith(1);
    expect(body).toMatchObject({
      contentType: 'collaborative_documents',
      contentId: 'd-new',
      note: 'Bitte lesen',
      permissions: { read: true, write: false },
    });
  });
});
