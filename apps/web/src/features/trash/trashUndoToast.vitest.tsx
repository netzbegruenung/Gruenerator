import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { Toaster, toast } from '@gruenerator/ui';
import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../test/msw-server';

import { showTrashUndoToast } from './trashUndoToast';

const TRASH = 'http://localhost/api/trash';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  // sonner captures the pointer on its toasts for swipe-to-dismiss; jsdom has no Pointer Capture API.
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
});

afterEach(async () => {
  toast.dismiss();
  // sonner unmounts a dismissed toast on a 200 ms timer. Left running after the
  // last test, it fires a state update once jsdom is gone: "window is not defined".
  await waitFor(() => expect(document.querySelector('[data-sonner-toast]')).toBeNull());
});

function setup() {
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  render(<Toaster />);
  return { qc, invalidate, user: userEvent.setup() };
}

describe('showTrashUndoToast', () => {
  it('restores the item through the trash API when „Rückgängig“ is clicked', async () => {
    const requests: string[] = [];
    server.use(
      http.post(`${TRASH}/:kind/:id/restore`, ({ params }) => {
        requests.push(`${String(params.kind)}/${String(params.id)}`);
        return HttpResponse.json({
          kind: params.kind,
          id: params.id,
          title: 'Antrag Radwege',
          subtype: null,
          deletedAt: new Date().toISOString(),
          purgeAt: new Date().toISOString(),
        });
      })
    );
    const { qc, invalidate, user } = setup();
    const onRestored = vi.fn();

    showTrashUndoToast(
      qc,
      { kind: 'collaborative_document', id: '1', title: 'Antrag Radwege' },
      { onRestored }
    );

    expect(
      await screen.findByText('„Antrag Radwege“ wurde in den Papierkorb verschoben.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rückgängig' }));

    expect(await screen.findByText('Wiederhergestellt.')).toBeInTheDocument();
    expect(requests).toEqual(['collaborative_document/1']);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['documents', 'list'] });
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it('names the type when the item has no title', async () => {
    const { qc } = setup();
    showTrashUndoToast(qc, { kind: 'user_letterhead', id: 'l1', title: null });
    expect(
      await screen.findByText('Briefkopf wurde in den Papierkorb verschoben.')
    ).toBeInTheDocument();
  });

  it('shows an error toast and does not report success when the restore fails', async () => {
    server.use(
      http.post(`${TRASH}/:kind/:id/restore`, () =>
        HttpResponse.json({ error: 'kaputt' }, { status: 500 })
      )
    );
    const { qc, user } = setup();
    const onRestored = vi.fn();

    showTrashUndoToast(qc, { kind: 'shared_media', id: 'tok-1', title: 'Plakat' }, { onRestored });
    await user.click(await screen.findByRole('button', { name: 'Rückgängig' }));

    await waitFor(() => expect(document.querySelector('[data-type="error"]')).not.toBeNull());
    expect(screen.queryByText('Wiederhergestellt.')).not.toBeInTheDocument();
    expect(onRestored).not.toHaveBeenCalled();
  });
});
