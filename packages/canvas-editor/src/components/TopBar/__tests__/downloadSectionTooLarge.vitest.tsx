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
});
