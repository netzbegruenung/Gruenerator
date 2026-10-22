import { PRINT_UNGETESTET_HINWEIS } from '@gruenerator/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DownloadSection } from '../DownloadSection';

describe('DownloadSection print export', () => {
  it('defaults to the PDF and downloads it instead of the raster export', async () => {
    const onDownload = vi.fn();
    const onDownloadPdf = vi.fn().mockResolvedValue(undefined);
    render(
      <DownloadSection
        onDownload={onDownload}
        pageCount={2}
        printExport={{ onDownloadPdf, getWarnings: () => [] }}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Herunterladen/ }));
    await waitFor(() => expect(onDownloadPdf).toHaveBeenCalledTimes(1));
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('shows the low-resolution notice', () => {
    render(
      <DownloadSection
        onDownload={vi.fn()}
        pageCount={1}
        printExport={{
          onDownloadPdf: vi.fn(),
          getWarnings: () => ['Foto 1 ist für den Druck zu klein (ca. 102 dpi, empfohlen 300).'],
        }}
      />
    );
    const notices = screen.getAllByRole('status').map((n) => n.textContent);
    expect(notices.some((t) => t?.includes('ca. 102 dpi'))).toBe(true);
  });

  it('says that the print results are untested', () => {
    render(
      <DownloadSection
        onDownload={vi.fn()}
        pageCount={1}
        printExport={{ onDownloadPdf: vi.fn(), getWarnings: () => [] }}
      />
    );
    expect(screen.getByText(PRINT_UNGETESTET_HINWEIS)).toBeTruthy();
  });

  it('keeps the raster export for digital formats', async () => {
    const onDownload = vi.fn().mockResolvedValue(undefined);
    render(<DownloadSection onDownload={onDownload} pageCount={1} />);
    expect(screen.queryByText(PRINT_UNGETESTET_HINWEIS)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Herunterladen/ }));
    await waitFor(() => expect(onDownload).toHaveBeenCalledWith('png', 1, false));
  });
});
