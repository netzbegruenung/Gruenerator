/**
 * Two things are pinned here.
 *
 * The rule: the recipient — and nothing else — decides between a document with
 * a letterhead and a DIN 5008 letter. It used to be two menu entries, and the
 * one that skipped the dialog produced the document, so whoever wanted a letter
 * got a sender band and no address field.
 *
 * The promise of `role="dialog"` + `aria-modal`: focus stays inside, Escape
 * closes, focus returns to the opener. Without it a keyboard or screen-reader
 * user lands behind the overlay with no way back — a poor look for a feature
 * whose main argument is accessible PDFs.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PdfExportDialog, type PdfExportSubmit } from './PdfExportDialog';

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

function setup(props: Partial<Parameters<typeof PdfExportDialog>[0]> = {}) {
  const onCancel = vi.fn();
  const onSubmit = vi.fn<(result: PdfExportSubmit) => void>();
  render(
    <PdfExportDialog
      documentTitle="Antrag zum Radverkehr"
      documentText="Ein Absatz ohne Briefmerkmale."
      defaultSignature="Moritz Wächter"
      letterheads={LETTERHEADS}
      onCancel={onCancel}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { onCancel, onSubmit };
}

describe('PdfExportDialog — layout follows the recipient', () => {
  it('exports a document with letterhead when no recipient is given', async () => {
    const { onSubmit } = setup();

    await userEvent.click(screen.getByRole('button', { name: /PDF erstellen/i }));

    const result = onSubmit.mock.calls[0]![0];
    expect(result.layout).toBe('letterhead');
    expect(result.letter).toBeUndefined();
    expect(result.letterhead).toEqual({ letterheadId: 'lh-1' });
  });

  it('turns into a DIN letter as soon as a recipient is typed', async () => {
    const { onSubmit } = setup();

    await userEvent.type(screen.getByLabelText(/Empfänger/), 'Stadt Musterstadt\n12345 Ort');
    await userEvent.click(screen.getByRole('button', { name: /Brief erstellen/i }));

    const result = onSubmit.mock.calls[0]![0];
    expect(result.layout).toBe('letter');
    expect(result.letter?.recipient).toBe('Stadt Musterstadt\n12345 Ort');
    // Defaults the user never touched still have to travel.
    expect(result.letter?.subject).toBe('Antrag zum Radverkehr');
    expect(result.letter?.salutation).toBe('Sehr geehrte Damen und Herren,');
    expect(result.letter?.signature).toBe('Moritz Wächter');
  });

  it('hides the DIN fields until there is a recipient', async () => {
    setup();

    expect(screen.queryByLabelText('Betreff')).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Empfänger/), 'Stadt Musterstadt');

    expect(screen.getByLabelText('Betreff')).toBeInTheDocument();
    expect(screen.getByLabelText('Anrede')).toBeInTheDocument();
  });

  it('names the outcome before the file exists', async () => {
    setup();

    expect(screen.getByText('Dokument mit Briefkopf')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Empfänger/), 'Stadt Musterstadt');

    expect(screen.getByText('Brief nach DIN 5008')).toBeInTheDocument();
  });

  it('treats whitespace as no recipient', async () => {
    const { onSubmit } = setup();

    await userEvent.type(screen.getByLabelText(/Empfänger/), '   ');
    await userEvent.click(screen.getByRole('button', { name: /PDF erstellen/i }));

    expect(onSubmit.mock.calls[0]![0].layout).toBe('letterhead');
  });

  it('prefills from the document and opens as a letter', async () => {
    const { onSubmit } = setup({
      documentText: [
        'Stadt Musterstadt',
        'Rathausplatz 1',
        '12345 Musterstadt',
        '',
        'Betreff: Radverkehrskonzept',
        '',
        'Sehr geehrte Frau Bürgermeisterin,',
      ].join('\n'),
    });

    // No typing at all — the document itself supplied the recipient.
    expect(screen.getByText('Brief nach DIN 5008')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Brief erstellen/i }));

    const result = onSubmit.mock.calls[0]![0];
    expect(result.layout).toBe('letter');
    expect(result.letter?.recipient).toContain('Musterstadt');
    // Recognised lines are removed by default so they do not appear twice.
    expect(result.stripDetected).toBe(true);
  });

  it('never reports stripDetected for a document export', async () => {
    const { onSubmit } = setup({
      documentText: ['Stadt Musterstadt', 'Rathausplatz 1', '12345 Musterstadt'].join('\n'),
    });

    await userEvent.clear(screen.getByLabelText(/Empfänger/));
    await userEvent.click(screen.getByRole('button', { name: /PDF erstellen/i }));

    const result = onSubmit.mock.calls[0]![0];
    expect(result.layout).toBe('letterhead');
    // Stripping lines out of a document nobody turned into a letter would
    // delete content for no reason.
    expect(result.stripDetected).toBe(false);
  });
});

describe('PdfExportDialog — Absender', () => {
  it('submits the letterhead the user picked', async () => {
    const { onSubmit } = setup();

    await userEvent.selectOptions(screen.getByLabelText('Briefkopf'), 'lh-2');
    await userEvent.click(screen.getByRole('button', { name: /PDF erstellen/i }));

    expect(onSubmit.mock.calls[0]![0].letterhead).toEqual({ letterheadId: 'lh-2' });
  });

  it('lets a new Absender be typed and optionally saved', async () => {
    const { onSubmit } = setup();

    await userEvent.selectOptions(screen.getByLabelText('Briefkopf'), '__new__');
    await userEvent.type(screen.getByLabelText('Organisation'), 'Einmalig e.V.');
    await userEvent.click(screen.getByLabelText(/Für später speichern/i));
    await userEvent.click(screen.getByRole('button', { name: /PDF erstellen/i }));

    const { letterhead } = onSubmit.mock.calls[0]![0];
    expect(letterhead.inline?.organization).toBe('Einmalig e.V.');
    // No name typed → the organisation becomes the label, one field less.
    expect(letterhead.saveForLater?.label).toBe('Einmalig e.V.');
  });

  it('cannot be submitted with nothing to print', () => {
    setup({ letterheads: [] });

    expect(screen.getByRole('button', { name: /PDF erstellen/i })).toBeDisabled();
  });
});

describe('PdfExportDialog — modal behaviour', () => {
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

  it('returns focus to the opener when it closes', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <PdfExportDialog
        documentTitle="Antrag"
        documentText="Text"
        defaultSignature=""
        letterheads={LETTERHEADS}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    unmount();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
