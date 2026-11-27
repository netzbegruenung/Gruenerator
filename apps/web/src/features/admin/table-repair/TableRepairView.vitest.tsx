import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import TableRepairView from './TableRepairView';

const scanTablePage = vi.fn();
const repairTableSources = vi.fn();
vi.mock('./tableRepairApi', () => ({
  scanTablePage: (...a: unknown[]) => scanTablePage(...a) as unknown,
  repairTableSources: (...a: unknown[]) => repairTableSources(...a) as unknown,
}));

const PDF = '11111111-1111-1111-1111-111111111111';
const CSV = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  scanTablePage.mockReset();
  repairTableSources.mockReset();
  // Zwei Seiten: der Lauf folgt dem Cursor, bis keiner mehr kommt.
  scanTablePage
    .mockResolvedValueOnce({
      findings: [
        {
          documentId: PDF,
          extension: '.pdf',
          state: 'fixable',
          source: 'original',
          missedPages: [3, 4],
        },
        { documentId: 'x', extension: '.pdf', state: 'no_original', source: null, missedPages: [] },
      ],
      nextCursor: 'x',
      total: 3,
    })
    .mockResolvedValueOnce({
      findings: [
        {
          documentId: CSV,
          extension: '.csv',
          state: 'fixable',
          source: 'stored-text',
          missedPages: [],
        },
      ],
      nextCursor: null,
      total: null,
    });
});

describe('TableRepairView', () => {
  it('prüft seitenweise und reiht die reparierbaren Quellen erst nach Bestätigung ein', async () => {
    repairTableSources.mockResolvedValue([
      { documentId: PDF, status: 'queued' },
      { documentId: CSV, status: 'consent_missing' },
    ]);
    const { user } = renderWithProviders(<TableRepairView />);

    await user.click(screen.getByRole('button', { name: 'Prüfung starten' }));
    const start = await screen.findByRole('button', { name: '2 neu indexieren' });

    expect(scanTablePage).toHaveBeenNthCalledWith(2, 'x', 25);
    expect(screen.getByText('von 3')).toBeInTheDocument();
    expect(screen.getByText('Seiten 3, 4')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '11111111' })).toHaveAttribute(
      'href',
      `/admin/chunks/${PDF}?collection=documents`
    );

    await user.click(start);
    expect(repairTableSources).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('etwa 2 PDF-Seiten gehen an Mistral OCR');
    expect(await axe(dialog)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: 'Bestätigen' }));

    await waitFor(() => expect(screen.getByText('Eingereiht')).toBeInTheDocument());
    expect(repairTableSources).toHaveBeenCalledWith([PDF, CSV]);
    expect(screen.getByText('Keine KI-Einwilligung')).toBeInTheDocument();
  });
});
