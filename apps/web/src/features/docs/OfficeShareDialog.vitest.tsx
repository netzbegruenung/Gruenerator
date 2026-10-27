import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@gruenerator/docs', () => ({
  ShareModal: ({ documentId }: { documentId: string }) => <div>docs-share:{documentId}</div>,
}));
vi.mock('../image-studio/components/ShareCanvasDialog', () => ({
  ShareCanvasDialog: ({ canvasId }: { canvasId: string }) => <div>canvas-share:{canvasId}</div>,
}));

import { OfficeShareDialog } from './OfficeShareDialog';

describe('OfficeShareDialog', () => {
  it('shares canvas decks through the canvas dialog, not the docs modal', async () => {
    render(
      <OfficeShareDialog
        target={{ id: 'deck-1', title: 'Folien', documentSubtype: 'canvas' }}
        onClose={vi.fn()}
      />
    );
    expect(await screen.findByText('canvas-share:deck-1')).toBeTruthy();
    expect(screen.queryByText(/docs-share/)).toBeNull();
  });

  it('keeps text documents on the docs share modal', async () => {
    render(
      <OfficeShareDialog
        target={{ id: 'doc-1', title: 'Text', documentSubtype: 'blank' }}
        onClose={vi.fn()}
      />
    );
    expect(await screen.findByText('docs-share:doc-1')).toBeTruthy();
    expect(screen.queryByText(/canvas-share/)).toBeNull();
  });
});
