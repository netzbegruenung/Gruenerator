// „Neu indexieren" erscheint nur, wo das Original noch erreichbar ist — ein
// Upload ohne Original bekäme sonst einen Knopf, der nichts tun kann.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../../test-utils';

import { DocumentRow } from './DocumentRow';

const baseProps = {
  source: 'wolke' as const,
  indexing: false,
  failure: null,
  selected: false,
  loading: false,
  onToggleSelect: () => {},
  onRemove: () => {},
};

describe('DocumentRow — Neu indexieren', () => {
  it('zeigt den Knopf für erreichbare Quellen und reicht die ID durch', async () => {
    const onReindex = vi.fn();
    const { container } = render(
      <DocumentRow
        {...baseProps}
        doc={{ id: 'doc-1', title: 'Antrag.pdf', reindexable: true }}
        onReindex={onReindex}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Antrag.pdf neu indexieren' }));
    expect(onReindex).toHaveBeenCalledWith('doc-1');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('zeigt ihn nicht ohne Original', () => {
    render(
      <DocumentRow
        {...baseProps}
        source="upload"
        doc={{ id: 'doc-2', title: 'Scan.pdf' }}
        onReindex={null}
      />
    );
    expect(screen.queryByRole('button', { name: /neu indexieren/ })).toBeNull();
  });

  it('sperrt ihn, solange die Quelle verarbeitet wird', () => {
    render(
      <DocumentRow
        {...baseProps}
        indexing
        doc={{ id: 'doc-1', title: 'Antrag.pdf', reindexable: true }}
        onReindex={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Antrag.pdf neu indexieren' })).toBeDisabled();
  });
});
