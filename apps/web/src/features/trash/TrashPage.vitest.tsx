import { type TrashItem } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../test/msw-server';
import { axe, renderWithProviders, screen, waitFor, within } from '../../test-utils';

import TrashPage from './TrashPage';

const TRASH = 'http://localhost/api/trash';
const DAY = 86_400_000;

function item(over: Partial<TrashItem> = {}): TrashItem {
  return {
    kind: 'collaborative_document',
    id: 'd1',
    title: 'Antrag Radwege',
    subtype: 'antrag',
    deletedAt: new Date(Date.now() - 2 * DAY).toISOString(),
    purgeAt: new Date(Date.now() + 5 * DAY).toISOString(),
    ...over,
  };
}

/** A tiny in-memory trash the handlers read and write, plus what was asked of it. */
function serveTrash(initial: TrashItem[]) {
  let items = [...initial];
  const requests: string[] = [];
  server.use(
    http.get(TRASH, ({ request }) => {
      const url = new URL(request.url);
      requests.push(`GET ${url.search}`);
      const kind = url.searchParams.get('kind');
      return HttpResponse.json({
        items: kind ? items.filter((i) => i.kind === kind) : items,
        nextCursor: null,
      });
    }),
    http.post(`${TRASH}/:kind/:id/restore`, ({ params }) => {
      requests.push(`POST ${String(params.kind)}/${String(params.id)}`);
      const found = items.find((i) => i.kind === params.kind && i.id === params.id);
      items = items.filter((i) => i !== found);
      return HttpResponse.json(found);
    }),
    http.delete(`${TRASH}/:kind/:id`, ({ params }) => {
      requests.push(`DELETE ${String(params.kind)}/${String(params.id)}`);
      items = items.filter((i) => !(i.kind === params.kind && i.id === params.id));
      return HttpResponse.json({ purged: 1 });
    }),
    http.delete(TRASH, () => {
      requests.push('DELETE all');
      const purged = items.length;
      items = [];
      return HttpResponse.json({ purged });
    })
  );
  return requests;
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  // Radix' Select drives its trigger through the Pointer Capture API, which
  // jsdom does not implement.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

describe('TrashPage', () => {
  it('lists each item with its type, deletion time and countdown', async () => {
    serveTrash([
      item(),
      item({
        kind: 'shared_media',
        id: 'm1',
        title: 'Plakat',
        subtype: 'image',
        purgeAt: new Date(Date.now() + 1 * DAY).toISOString(),
      }),
    ]);
    const { container } = renderWithProviders(<TrashPage />);

    const list = await screen.findByRole('list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Antrag Radwege');
    expect(rows[0]).toHaveTextContent(
      'Dokument · gelöscht vor 2 Tagen · wird in 5 Tagen endgültig gelöscht'
    );
    expect(rows[1]).toHaveTextContent(
      'Bild · gelöscht vor 2 Tagen · wird morgen endgültig gelöscht'
    );
    expect(
      screen.getByRole('button', { name: 'Wiederherstellen „Antrag Radwege“' })
    ).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the empty state when nothing is in the trash', async () => {
    serveTrash([]);
    const { container } = renderWithProviders(<TrashPage />);

    expect(await screen.findByText('Der Papierkorb ist leer.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Gelöschte Inhalte landen hier und lassen sich 30 Tage lang wiederherstellen.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Papierkorb leeren/ })).toBeDisabled();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('sends the chosen kind as ?kind=', async () => {
    const requests = serveTrash([item()]);
    const { user } = renderWithProviders(<TrashPage />);
    await screen.findByRole('list');

    await user.click(screen.getByRole('combobox', { name: 'Inhalte filtern' }));
    await user.click(await screen.findByRole('option', { name: 'Rezept' }));

    await waitFor(() =>
      expect(requests.some((r) => r.startsWith('GET') && r.includes('kind=user_text_form'))).toBe(
        true
      )
    );
    expect(await screen.findByText('Der Papierkorb ist leer.')).toBeInTheDocument();
  });

  it('restores an item and removes its row', async () => {
    const requests = serveTrash([item(), item({ id: 'd2', title: 'Pressemitteilung' })]);
    const { user } = renderWithProviders(<TrashPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Wiederherstellen „Antrag Radwege“' })
    );

    await waitFor(() => expect(screen.queryByText('Antrag Radwege')).not.toBeInTheDocument());
    expect(requests).toContain('POST collaborative_document/d1');
    expect(screen.getByText('Pressemitteilung')).toBeInTheDocument();
    // The removed row took the focused button; the toolbar catches the focus.
    expect(screen.getByRole('combobox', { name: 'Inhalte filtern' })).toHaveFocus();
  });

  it('purges only after the confirmation', async () => {
    const requests = serveTrash([item()]);
    const { user } = renderWithProviders(<TrashPage />);
    const purge = await screen.findByRole('button', { name: 'Endgültig löschen „Antrag Radwege“' });

    await user.click(purge);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('„Antrag Radwege“ endgültig löschen?');
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(requests.filter((r) => r.startsWith('DELETE'))).toEqual([]);

    await user.click(purge);
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Endgültig löschen',
      })
    );

    await waitFor(() => expect(requests).toContain('DELETE collaborative_document/d1'));
    expect(await screen.findByText('Der Papierkorb ist leer.')).toBeInTheDocument();
  });

  it('empties the trash after the AlertDialog', async () => {
    const requests = serveTrash([item(), item({ id: 'd2', title: 'Pressemitteilung' })]);
    const { user } = renderWithProviders(<TrashPage />);
    await screen.findByRole('list');

    await user.click(screen.getByRole('button', { name: /Papierkorb leeren/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Alle Inhalte im Papierkorb werden endgültig gelöscht. Das kann nicht rückgängig gemacht werden.'
    );
    expect(requests).not.toContain('DELETE all');

    await user.click(within(dialog).getByRole('button', { name: 'Papierkorb leeren' }));

    await waitFor(() => expect(requests).toContain('DELETE all'));
    expect(await screen.findByText('Der Papierkorb ist leer.')).toBeInTheDocument();
  });
});
