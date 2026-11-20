import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';
import { axe, renderWithProviders } from '../../../test-utils';

import { ProjectAddMenu } from './ProjectAddMenu';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNavigate: () => navigate,
}));

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function setup(canAddLink: boolean) {
  const onPickExisting = vi.fn();
  const onAddLink = vi.fn();
  const onError = vi.fn();
  const utils = renderWithProviders(
    <ProjectAddMenu
      groupId="g1"
      onPickExisting={onPickExisting}
      {...(canAddLink && { onAddLink })}
      onFileAdded={vi.fn()}
      onTextAdded={vi.fn()}
      onError={onError}
    />
  );
  return { ...utils, onPickExisting, onAddLink, onError };
}

describe('ProjectAddMenu', () => {
  it('puts picking existing content first, then what is created new', async () => {
    const { user, container } = setup(true);
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent);
    expect(items).toEqual([
      'Vorhandenes hinzufügen …',
      'Neues Doc',
      'Neues Sheet',
      'Neue Präsentation',
      'Neues Board',
      'Datei hochladen',
      'Text',
      'Link',
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('opens the picker; links only for admins', async () => {
    const { user, onPickExisting } = setup(false);
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(screen.queryByRole('menuitem', { name: 'Link' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Vorhandenes hinzufügen …' }));
    expect(onPickExisting).toHaveBeenCalledTimes(1);
  });

  it('opens the text dialog from the menu', async () => {
    const { user } = setup(false);
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Text' }));
    expect(await screen.findByRole('dialog', { name: 'Text hinzufügen' })).toBeInTheDocument();
  });

  it('creates a board right in the project and opens it', async () => {
    let body: unknown = null;
    server.use(
      http.post('*/api/boards', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { id: 'b-new', title: 'Neues Board', created_by: 'me' },
          { status: 201 }
        );
      })
    );
    const { user } = setup(false);
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Neues Board' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/boards/b-new'));
    expect(body).toMatchObject({ groupId: 'g1' });
  });

  it('shows the server sentence when the person may not share there', async () => {
    server.use(
      http.post('*/api/docs', () =>
        HttpResponse.json({ error: 'Keine Berechtigung für diese Aktion.' }, { status: 403 })
      )
    );
    const { user, onError } = setup(false);
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Neues Doc' }));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Keine Berechtigung für diese Aktion.')
    );
  });
});
