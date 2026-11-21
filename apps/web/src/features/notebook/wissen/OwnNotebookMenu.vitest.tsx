import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { Toaster } from '@gruenerator/ui';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test-utils';

import { OwnNotebookMenu } from './OwnNotebookMenu';

import type { NotebookCollection } from '../../../types/notebook';

vi.mock('../../groups/hooks/useGroups', () => ({
  useGroups: () => ({
    userGroups: [
      { id: 'g-in', name: 'KV Musterstadt' },
      { id: 'g-new', name: 'OV Nord' },
    ],
  }),
}));
vi.mock('../../auth/hooks/useProfileData', () => ({
  useNotebookCollections: () => ({ deleteQACollection: vi.fn() }),
}));
vi.mock('../../trash/trashUndoToast', () => ({ useTrashUndoToast: () => vi.fn() }));

const collection = { id: 'nb1', name: 'Klimaschutz' } as NotebookCollection;

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function setup() {
  server.use(
    http.get('*/api/auth/notebook-collections/nb1/groups', () =>
      HttpResponse.json([
        { group_id: 'g-in', group_name: 'KV Musterstadt', shared_at: '2026-11-19T10:00:00Z' },
      ])
    )
  );
  return renderWithProviders(
    <>
      <Toaster />
      <OwnNotebookMenu collection={collection} />
    </>
  );
}

/**
 * Per Tastatur: in jsdom (ohne Geometrie) klappt das Untermenü beim Mausweg zum
 * Eintrag zu, bevor der Klick ankommt.
 */
async function openShareMenu(user: ReturnType<typeof setup>['user']) {
  await user.click(screen.getByRole('button', { name: 'Aktionen für Klimaschutz' }));
  (await screen.findByRole('menuitem', { name: 'Teilen' })).focus();
  await user.keyboard('{ArrowRight}');
  await screen.findByRole('menuitem', { name: 'OV Nord' });
}

describe('OwnNotebookMenu — Teilen in Projekte', () => {
  it('marks the project the notebook is already in instead of offering it again', async () => {
    const { user } = setup();
    await openShareMenu(user);
    const inProject = await screen.findByRole('menuitem', { name: /KV Musterstadt.*Im Projekt/ });
    await waitFor(() => expect(inProject).toHaveAttribute('aria-disabled', 'true'));
    expect(screen.getByRole('menuitem', { name: 'OV Nord' })).not.toHaveAttribute('aria-disabled');
  });

  it('says what the server says when sharing is refused', async () => {
    let calls = 0;
    server.use(
      http.post('*/api/auth/groups/g-new/share', () => {
        calls += 1;
        return HttpResponse.json(
          { success: false, message: 'Du kannst in diesem Projekt nichts teilen.' },
          { status: 403 }
        );
      })
    );
    const { user } = setup();
    await openShareMenu(user);
    await screen.findByRole('menuitem', { name: /KV Musterstadt.*Im Projekt/ });
    // „Link kopieren“ hat den Fokus; der schon geteilte Eintrag wird übersprungen.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'OV Nord' })).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(calls).toBe(1));
    expect(
      await screen.findByText('Du kannst in diesem Projekt nichts teilen.')
    ).toBeInTheDocument();
  });
});
