import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DownloadSection } from '../DownloadSection';

describe('DownloadSection slide decks', () => {
  it('defaults to PowerPoint, shows its progress and the font hint', async () => {
    const onDownload = vi.fn();
    let finish = () => {};
    const onDownloadPptx = vi.fn((onProgress: (done: number, total: number) => void) => {
      onProgress(1, 3);
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    render(
      <DownloadSection
        onDownload={onDownload}
        pageCount={3}
        slideDeck={{ onDownloadPdf: vi.fn(), onDownloadPptx }}
      />
    );
    expect(screen.getByText(/PowerPoint \(\.pptx\)/)).toBeTruthy();
    expect(screen.getByText(/GrueneType Neue und PT Sans/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Herunterladen/ }));
    await waitFor(() => expect(screen.getByText('1/3')).toBeTruthy());
    finish();
    await waitFor(() => expect(screen.queryByText('1/3')).toBeNull());
    expect(onDownloadPptx).toHaveBeenCalledTimes(1);
    expect(onDownload).not.toHaveBeenCalled();
  });
});
