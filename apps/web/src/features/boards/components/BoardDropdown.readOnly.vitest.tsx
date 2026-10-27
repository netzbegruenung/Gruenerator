import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test-utils';

import { BoardDropdown } from './BoardDropdown';

const noop = () => {};

async function openMenu(readOnly: boolean) {
  renderWithProviders(
    <BoardDropdown
      boardId="b1"
      title="Wahlkampf"
      isArchived={false}
      readOnly={readOnly}
      expertMode={false}
      onDelete={noop}
      onArchiveToggle={noop}
      onExpertModeToggle={noop}
      onRename={noop}
      onOpenSettings={noop}
      onOpenActivity={noop}
      onDuplicate={noop}
      onOpenFullSettings={noop}
      isFavourite={false}
      onToggleFavourite={noop}
    />
  );
  await userEvent.click(screen.getByRole('button', { name: 'Board-Menü' }));
  return screen.getAllByRole('menuitem').map((item) => item.textContent?.trim());
}

describe('BoardDropdown read-only', () => {
  it('offers a viewer only what needs read access', async () => {
    const items = await openMenu(true);
    expect(items).toContain('Board duplizieren');
    expect(items).toContain('Aktivität anzeigen');
    expect(items).not.toContain('Umbenennen');
    expect(items).not.toContain('Teilen');
    expect(items).not.toContain('Board-Einstellungen');
  });

  it('keeps the full menu for editors', async () => {
    const items = await openMenu(false);
    expect(items).toContain('Umbenennen');
    expect(items).toContain('Teilen');
    expect(items).toContain('Board-Einstellungen');
    expect(items).not.toContain('Board duplizieren');
  });
});
