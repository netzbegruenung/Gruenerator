/**
 * When the app draws the menu bar natively, the editor draws none: no title
 * slot, no undo/redo, no "Teilen" button. The share menu still exists — the
 * host's button opens it.
 */
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasStoreProvider } from '../stores/CanvasStoreProvider';

import { Toolbar } from './Toolbar';

import type { ShareDropdownProps } from './TopBar/ShareDropdown';

const shareProps: ShareDropdownProps = {
  onCaptureCanvas: async () => null,
  onDownload: () => {},
  onNavigateToGallery: () => {},
  canvasText: '',
  canvasType: 'dreizeilen',
  canvasWidth: 1080,
  canvasHeight: 1350,
  shareToken: null,
};

function renderToolbar(hostShare?: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return render(
    <AutoSaveStoreProvider>
      <CanvasStoreProvider>
        <Toolbar
          canUndo
          canRedo
          handlers={{ undo: vi.fn(), undoPages: vi.fn(), redo: vi.fn() }}
          shareProps={shareProps}
          chromeCenter={<span>Mein Plakat</span>}
          suggestionInBar
          hostShare={hostShare}
        />
      </CanvasStoreProvider>
    </AutoSaveStoreProvider>
  );
}

describe('Toolbar with a host-drawn bar', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  it('draws its own bar without a host bar', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: /Teilen/ })).toBeInTheDocument();
    expect(screen.getByText('Mein Plakat')).toBeInTheDocument();
  });

  it('draws no bar, no title and no share button for the host', () => {
    renderToolbar({ open: false, onOpenChange: () => {} });
    expect(screen.queryByRole('button', { name: /Teilen/ })).toBeNull();
    expect(screen.queryByText('Mein Plakat')).toBeNull();
    expect(screen.queryByRole('button', { name: /Rückgängig/ })).toBeNull();
  });

  it('opens the share menu when the host asks', () => {
    renderToolbar({ open: true, onOpenChange: () => {} });
    expect(screen.getByRole('heading', { name: 'Teilen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
  });
});
