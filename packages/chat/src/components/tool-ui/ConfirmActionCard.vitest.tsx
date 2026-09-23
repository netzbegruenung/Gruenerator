/**
 * Ein im Chat bestätigtes Projekt existiert sofort — die Projektliste weiss es
 * nur nicht. `useUserGroups` hält seine Antwort 2 Minuten für frisch
 * (`staleTime`), und der Bestätigungs-POST läuft an React Query vorbei (ein
 * blankes `fetch` in `confirmChatAction`). `/projekte` und die Sidebar zeigten
 * das neue Projekt deshalb bis zu zwei Minuten lang nicht — aus Sicht der
 * Person ist es nicht angelegt worden.
 *
 * Invalidiert wird nur, was die eigene Mitgliedschaftsliste ändert: anlegen und
 * beitreten. Etwas IN eine Gruppe zu teilen ändert sie nicht.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmActionCard } from './ConfirmActionCard';

import type { ConfirmActionData, ConfirmActionType } from '../../types/messageMetadata';

const confirmChatAction = vi.hoisted(() => vi.fn());
vi.mock('../../lib/confirmAction', () => ({ confirmChatAction }));

function actionOf(type: ConfirmActionType): ConfirmActionData {
  return {
    threadId: 't1',
    actionId: 'a1',
    type,
    title: 'Projekt „Klima-AG" anlegen',
    description: 'Legt ein persönliches Projekt an.',
    icon: 'users',
    metadata: [],
    confirmLabel: 'Anlegen',
    cancelLabel: 'Abbrechen',
  };
}

function renderCard(type: ConfirmActionType) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  // Die Schlüssel mitschreiben, statt den Spy auszuwerten: `mock.calls` ist
  // untypisiert, und die Attrappe verhindert nebenbei einen echten Abruf.
  const invalidatedKeys: string[] = [];
  vi.spyOn(queryClient, 'invalidateQueries').mockImplementation((filters) => {
    invalidatedKeys.push(JSON.stringify(filters?.queryKey));
    return Promise.resolve();
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <ConfirmActionCard action={actionOf(type)} />
    </QueryClientProvider>
  );
  return { invalidatedKeys, user };
}

const USER_GROUPS_KEY = JSON.stringify(['userGroups']);

beforeEach(() => {
  vi.clearAllMocks();
  confirmChatAction.mockResolvedValue({ status: 'confirmed', url: '/gruppen/klima-ag-abc234' });
});

describe('ConfirmActionCard — Projektliste nach dem Bestätigen', () => {
  it('lädt die Projektliste neu, wenn ein Projekt angelegt wurde', async () => {
    const { invalidatedKeys, user } = renderCard('create_group');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(invalidatedKeys).toContain(USER_GROUPS_KEY);
  });

  it('lädt die Projektliste neu, wenn einer Gruppe beigetreten wurde', async () => {
    const { invalidatedKeys, user } = renderCard('join_group');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(invalidatedKeys).toContain(USER_GROUPS_KEY);
  });

  it('lässt die Projektliste in Ruhe, wenn nur ein Dokument gespeichert wurde', async () => {
    const { invalidatedKeys, user } = renderCard('save_as_doc');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(invalidatedKeys).not.toContain(USER_GROUPS_KEY);
  });

  it('lädt nichts neu, wenn die Aktion abgelehnt wurde', async () => {
    confirmChatAction.mockResolvedValue({ status: 'rejected' });
    const { invalidatedKeys, user } = renderCard('create_group');
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(invalidatedKeys).not.toContain(USER_GROUPS_KEY);
  });
});
