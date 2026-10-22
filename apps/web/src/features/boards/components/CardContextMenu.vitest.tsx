import { describe, expect, it, vi } from 'vitest';

import { axe, fireEvent, renderWithProviders, screen } from '../../../test-utils';
import { TaskDoneProvider } from '../context/TaskDoneContext';
import { FIELD_IDS } from '../types';

import { CardContent } from './CardContent';
import { CardContextMenu } from './CardContextMenu';

import type { Field, Row } from '../types';

const recordActivity = vi.fn(() => Promise.resolve({ status: 201 }));
vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ boardActivity: { recordActivity } }),
}));

const fields: Field[] = [
  {
    id: FIELD_IDS.STATUS,
    name: 'Status',
    type: 'singleSelect',
    order: 0,
    typeOptions: {
      options: [
        { id: 'status-todo', name: 'Zu erledigen', color: '#8aa' },
        { id: 'status-doing', name: 'In Arbeit', color: '#ca8' },
        { id: 'status-done', name: 'Erledigt', color: '#6a6', isDone: true },
      ],
    },
  },
];

function makeRow(status: string): Row {
  return {
    id: 'r1',
    cells: { [FIELD_IDS.TITLE]: 'Ideen sammeln', [FIELD_IDS.STATUS]: status },
    createdBy: 'u1',
    createdAt: '2026-10-01T10:00:00Z',
  };
}

function renderBoard({ status = 'status-todo', enabled = true } = {}) {
  const setDone = vi.fn();
  const onUpdateCell = vi.fn();
  const onDuplicate = vi.fn();
  const utils = renderWithProviders(
    <TaskDoneProvider value={{ doneStatusId: 'status-done', setDone }}>
      <CardContextMenu
        boardId="b1"
        fields={fields}
        enabled={enabled}
        onUpdateCell={onUpdateCell}
        onUpdateRow={() => {}}
        onDelete={() => {}}
        onDuplicate={onDuplicate}
      >
        <CardContent
          row={makeRow(status)}
          fields={fields}
          onCardClick={() => {}}
          onRenameCard={() => {}}
        />
      </CardContextMenu>
    </TaskDoneProvider>
  );
  const card = screen.getByRole('button', { name: /Ideen sammeln/ });
  return { ...utils, card, setDone, onUpdateCell, onDuplicate };
}

describe('CardContextMenu', () => {
  it('marks an open card as done from a right-click', async () => {
    const { card, setDone, user } = renderBoard();

    fireEvent.contextMenu(card, { clientX: 40, clientY: 40 });
    const menu = await screen.findByRole('menu', { name: 'Aktionen für „Ideen sammeln“' });
    expect(await axe(menu)).toHaveNoViolations();

    await user.click(screen.getByRole('menuitem', { name: 'Als erledigt markieren' }));
    expect(setDone).toHaveBeenCalledWith('r1', true);
  });

  it('offers to reopen a card that is already done', async () => {
    const { card, setDone, user } = renderBoard({ status: 'status-done' });

    fireEvent.contextMenu(card, { clientX: 40, clientY: 40 });
    await user.click(await screen.findByRole('menuitem', { name: 'Wieder öffnen' }));
    expect(setDone).toHaveBeenCalledWith('r1', false);
  });

  it('opens from the keyboard menu key, which reports no pointer', async () => {
    const { card } = renderBoard();

    card.focus();
    fireEvent.contextMenu(card, { clientX: 0, clientY: 0 });
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });

  it('duplicates the card', async () => {
    const { card, onDuplicate, user } = renderBoard();

    fireEvent.contextMenu(card, { clientX: 40, clientY: 40 });
    await user.click(await screen.findByRole('menuitem', { name: 'Duplizieren' }));
    expect(onDuplicate).toHaveBeenCalledWith('r1');
  });

  it('leaves the browser menu alone on a read-only board', () => {
    const { card } = renderBoard({ enabled: false });

    const notCancelled = fireEvent.contextMenu(card, { clientX: 40, clientY: 40 });
    expect(notCancelled).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
