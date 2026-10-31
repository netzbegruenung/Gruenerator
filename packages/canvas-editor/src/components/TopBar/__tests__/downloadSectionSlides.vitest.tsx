import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider } from '@ggraphic/editor/CanvasEditorProvider';
import { grueneratorCarousel } from '../../../composer/sharepicServices';
import { DownloadSection } from '@ggraphic/editor/components/TopBar/DownloadSection';

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
      <CanvasEditorProvider services={{ carousel: grueneratorCarousel }}>
        <DownloadSection
          onDownload={onDownload}
          pageCount={3}
          slideDeck={{ onDownloadPdf: vi.fn(), onDownloadPptx, locale: 'de-DE' }}
        />
      </CanvasEditorProvider>
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

  it('names the Austrian fonts for an AT deck', () => {
    render(
      <CanvasEditorProvider services={{ carousel: grueneratorCarousel }}>
        <DownloadSection
          onDownload={vi.fn()}
          pageCount={1}
          slideDeck={{ onDownloadPdf: vi.fn(), onDownloadPptx: vi.fn(), locale: 'de-AT' }}
        />
      </CanvasEditorProvider>
    );
    expect(screen.getByText(/Gotham Narrow Book, Bold und Ultra/)).toBeTruthy();
    expect(screen.queryByText(/GrueneType/)).toBeNull();
  });
});
