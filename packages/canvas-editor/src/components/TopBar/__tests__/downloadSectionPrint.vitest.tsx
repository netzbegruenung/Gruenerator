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
    expect(screen.getByRole('status').textContent).toContain('ca. 102 dpi');
  });

  it('keeps the raster export for digital formats', async () => {
    const onDownload = vi.fn().mockResolvedValue(undefined);
    render(<DownloadSection onDownload={onDownload} pageCount={1} />);
    await userEvent.click(screen.getByRole('button', { name: /Herunterladen/ }));
    await waitFor(() => expect(onDownload).toHaveBeenCalledWith('png', 1, false));
  });
});
