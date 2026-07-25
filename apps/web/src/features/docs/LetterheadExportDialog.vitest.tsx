/**
 * `role="dialog"` + `aria-modal` is a promise: focus stays inside, Escape
 * closes, and focus returns to whatever opened it. Without that a keyboard or
 * screen-reader user lands behind the overlay with no way back — which is a
 * poor look for a feature whose main argument is accessible PDFs.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LetterheadExportDialog } from './LetterheadExportDialog';

import type { LetterheadChoice } from './LetterheadChooser';
import type { Letterhead } from '../settings/letterheadApi';

const LETTERHEADS: Letterhead[] = [
  {
    id: 'lh-1',
    label: 'KV Musterstadt',
    organization: 'KV Musterstadt',
    address: 'Weg 1\n12345 Ort',
    is_default: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'lh-2',
    label: 'Fraktion im Rat',
    organization: 'Fraktion',
    address: null,
    is_default: false,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

function setup(props: Partial<Parameters<typeof LetterheadExportDialog>[0]> = {}) {
  const onCancel = vi.fn();
  const onSubmit = vi.fn<(choice: LetterheadChoice) => void>();
  render(
    <LetterheadExportDialog
      letterheads={LETTERHEADS}
      onCancel={onCancel}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { onCancel, onSubmit };
}

describe('LetterheadExportDialog', () => {
  it('preselects the default letterhead', async () => {
    const { onSubmit } = setup();

    await userEvent.click(screen.getByRole('button', { name: /PDF erstellen/i }));

    expect(onSubmit).toHaveBeenCalledWith({ letterheadId: 'lh-1' });
  });

  it('submits the letterhead the user picked', async () => {
    const { onSubmit } = setup();

    await userEvent.selectOptions(screen.getByLabelText('Briefkopf'), 'lh-2');
    await userEvent.click(screen.getByRole('button', { name: /PDF erstellen/i }));

    expect(onSubmit).toHaveBeenCalledWith({ letterheadId: 'lh-2' });
  });

  it('lets a new Absender be typed and optionally saved', async () => {
    const { onSubmit } = setup();

    await userEvent.selectOptions(screen.getByLabelText('Briefkopf'), '__new__');
    await userEvent.type(screen.getByLabelText('Organisation'), 'Einmalig e.V.');
    await userEvent.click(screen.getByLabelText(/Für später speichern/i));
    await userEvent.click(screen.getByRole('button', { name: /PDF erstellen/i }));

    const choice = onSubmit.mock.calls[0]![0];
    expect(choice.inline?.organization).toBe('Einmalig e.V.');
    // No name typed → the organisation becomes the label, one field less.
    expect(choice.saveForLater?.label).toBe('Einmalig e.V.');
  });

  it('cannot be submitted with nothing to print', async () => {
    setup({ letterheads: [] });

    expect(screen.getByRole('button', { name: /PDF erstellen/i })).toBeDisabled();
  });

  it('closes on Escape', async () => {
    const { onCancel } = setup();

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalled();
  });

  it('moves focus into the dialog on open', () => {
    setup();

    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('keeps Tab inside the dialog', async () => {
    setup();
    const dialog = screen.getByRole('dialog');

    // Tab through more elements than the dialog has — focus must never land
    // on the page behind it.
    for (let i = 0; i < 12; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('returns focus to the opener when it closes', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <LetterheadExportDialog letterheads={LETTERHEADS} onCancel={vi.fn()} onSubmit={vi.fn()} />
    );
    unmount();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
