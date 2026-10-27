import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test-utils';
import { BoardReadOnlyContext } from '../context/BoardReadOnlyContext';
import { FIELD_IDS } from '../types';

import { CardDetailPanel } from './CardDetailPanel';

import type { Row } from '../types';

// Comments stay writable for viewers (the comments API only checks read access);
// the stand-in lets the test see whether the read-only fieldset reaches it.
vi.mock('./CardComments', () => ({
  CardComments: () => <textarea aria-label="Kommentar schreiben" />,
}));
vi.mock('./CardFiles', () => ({ CardFiles: () => null }));
vi.mock('./CardActivity', () => ({ CardActivity: () => null }));

const row: Row = {
  id: 'r1',
  cells: { [FIELD_IDS.TITLE]: 'Ansprache Neumitglied', [FIELD_IDS.DUE_DATE]: '2026-06-21' },
  createdBy: 'u1',
  createdAt: '2026-06-01T10:00:00Z',
};

function renderPanel(readOnly: boolean) {
  const onUpdateCell = vi.fn();
  renderWithProviders(
    <BoardReadOnlyContext.Provider value={readOnly}>
      <CardDetailPanel
        row={row}
        fields={[]}
        open
        onOpenChange={() => {}}
        onUpdateCell={onUpdateCell}
        onUpdateRow={() => {}}
        onDelete={() => {}}
        onUpdateField={() => {}}
      />
    </BoardReadOnlyContext.Provider>
  );
  return { onUpdateCell };
}

describe('CardDetailPanel read-only', () => {
  it('locks every card field but keeps comments open', () => {
    renderPanel(true);

    expect(screen.getByRole('button', { name: /21\. Juni 2026/ })).toBeDisabled();
    expect(screen.getByPlaceholderText('Kartentitel')).toHaveAttribute('readonly');
    expect(screen.queryByTitle('Aktionen')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Speichern/ })).not.toBeInTheDocument();
    expect(screen.getByText('Nur Ansicht')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Kommentar schreiben' })).toBeEnabled();
  });

  it('leaves an editable card untouched', () => {
    renderPanel(false);

    expect(screen.getByRole('button', { name: /21\. Juni 2026/ })).toBeEnabled();
    expect(screen.getByTitle('Aktionen')).toBeInTheDocument();
    expect(screen.queryByText('Nur Ansicht')).not.toBeInTheDocument();
  });
});
