import { NativeDownloadTooLargeError } from '@gruenerator/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DownloadSection } from '../DownloadSection';

describe('DownloadSection too-large download', () => {
  it('shows the German notice instead of an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const onDownload = vi.fn().mockRejectedValue(new NativeDownloadTooLargeError());
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<DownloadSection onDownload={onDownload} pageCount={1} />);
    await userEvent.click(screen.getByRole('button', { name: /Herunterladen/ }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('zu groß für die App');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Herunterladen/ })).toBeEnabled()
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
  });

  it('shows the multi-page export notice and error passed from the hook', () => {
    const { rerender } = render(
      <DownloadSection
        onDownload={vi.fn()}
        onDownloadAllZip={vi.fn()}
        pageCount={3}
        exportNotice="Seite 2 von 3 wird gesendet …"
      />
    );
    expect(screen.getByRole('status').textContent).toContain('Seite 2 von 3');

    rerender(
      <DownloadSection
        onDownload={vi.fn()}
        onDownloadAllZip={vi.fn()}
        pageCount={3}
        exportError="Die Datei ist zu groß, um sie in der App zu speichern."
      />
    );
    expect(screen.getByRole('alert').textContent).toContain('zu groß');
  });
});
