import { type CanvasEditorExportApi } from '@gruenerator/canvas-editor';
import { createRef, type RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { axe, render, screen, userEvent, waitFor } from '../../test-utils';

import { CanvasPresentMode, presentPixelRatio } from './CanvasPresentMode';

function setup(
  pages = ['data:image/png;base64,AA', 'data:image/png;base64,BB', 'data:image/png;base64,CC']
) {
  const capturePages = vi.fn().mockResolvedValue(pages);
  const exportApi = createRef<CanvasEditorExportApi>() as RefObject<CanvasEditorExportApi | null>;
  (exportApi as { current: unknown }).current = { capturePages };
  const onClose = vi.fn();
  const view = render(<CanvasPresentMode exportApi={exportApi} onClose={onClose} />);
  return { ...view, capturePages, onClose };
}

describe('CanvasPresentMode', () => {
  it('shows a loading state, then the first slide and the counter', async () => {
    setup();
    expect(screen.getByRole('status')).toHaveTextContent(/gerendert/);
    expect(await screen.findByAltText('Folie 1 von 3')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('navigates with arrows, page keys and space, and stops at the bounds', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByAltText('Folie 1 von 3');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    await user.keyboard(' ');
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    await user.keyboard('{PageDown}');
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    await user.keyboard('{PageUp}');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('closes on Escape and on the close button', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();
    await screen.findByAltText('Folie 1 von 3');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Präsentation beenden' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders at screen width, capped at 3840 px', async () => {
    expect(presentPixelRatio(1920, 1)).toBe(1);
    expect(presentPixelRatio(2560, 2)).toBe(2);
    const { capturePages } = setup();
    await waitFor(() => expect(capturePages).toHaveBeenCalledTimes(1));
    const [options] = capturePages.mock.calls[0] as [{ pixelRatio: number }];
    const ratio = options.pixelRatio;
    expect(ratio * 1920).toBeLessThanOrEqual(3840);
  });

  it('has no axe violations', async () => {
    const { container } = setup();
    await screen.findByAltText('Folie 1 von 3');
    expect(await axe(container)).toHaveNoViolations();
  });
});
