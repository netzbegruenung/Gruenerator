import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PillTabs } from '../../../../components/common/PillTabs';
import { axe } from '../../../../test-utils';

import { SourceTable } from './SourceTable';

const rows = [
  {
    id: 'a',
    title: 'Antrag.pdf',
    created_at: '2026-09-01T10:00:00Z',
    status: 'completed',
    reindexable: true,
  },
  { id: 'b', title: 'Protokoll.docx', created_at: '2026-09-01T10:00:00Z', status: 'processing' },
  {
    id: 'c',
    title: 'Scan.pdf',
    created_at: '2026-09-01T10:00:00Z',
    status: 'failed',
    processing_error: 'Kein Text erkannt.',
  },
];

function setup() {
  const onRemove = vi.fn(async () => {});
  const onReindex = vi.fn(async () => {});
  const onPreview = vi.fn();
  const utils = render(
    <SourceTable
      rows={rows}
      onPreview={onPreview}
      actions={[]}
      onRemove={onRemove}
      onReindex={onReindex}
    />
  );
  return { ...utils, onRemove, onReindex, onPreview, user: userEvent.setup() };
}

describe('SourceTable', () => {
  it('zeigt die Bulk-Leiste erst mit einer Auswahl und entfernt die ausgewählten Zeilen', async () => {
    const { user, onRemove } = setup();
    expect(screen.queryByText(/ausgewählt/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Antrag.pdf auswählen' }));
    await user.click(screen.getByRole('checkbox', { name: 'Scan.pdf auswählen' }));
    expect(screen.getByText('2 ausgewählt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Entfernen' }));
    expect(onRemove).toHaveBeenCalledWith(['a', 'c']);
    expect(screen.queryByText(/ausgewählt/)).not.toBeInTheDocument();
  });

  it('indexiert nur die Zeilen neu, deren Original erreichbar ist', async () => {
    const { user, onReindex } = setup();

    await user.click(screen.getByRole('checkbox', { name: 'Alle auswählen' }));
    await user.click(screen.getByRole('button', { name: 'Neu indexieren' }));

    expect(onReindex).toHaveBeenCalledWith(['a']);
  });

  it('zeigt den Grund eines Fehlschlags an der Zeile', () => {
    setup();
    expect(screen.getAllByText('Kein Text erkannt.').length).toBeGreaterThan(0);
  });

  it('öffnet die Vorschau über den Namen', async () => {
    const { user, onPreview } = setup();
    await user.click(screen.getByRole('button', { name: 'Protokoll.docx' }));
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('hat keine axe-Verstöße', async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('PillTabs', () => {
  it('markiert den aktiven Reiter und meldet den Wechsel', async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <PillTabs
        ariaLabel="Quellen"
        active="upload"
        onSelect={onSelect}
        tabs={[
          { key: 'upload', label: 'Upload' },
          { key: 'wolke', label: 'Wolke' },
        ]}
      />
    );
    const tablist = screen.getByRole('tablist', { name: 'Quellen' });
    expect(within(tablist).getByRole('tab', { name: 'Upload' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await userEvent.setup().click(within(tablist).getByRole('tab', { name: 'Wolke' }));
    expect(onSelect).toHaveBeenCalledWith('wolke');
    expect(await axe(container)).toHaveNoViolations();
  });
});
