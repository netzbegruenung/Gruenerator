import {
  EDITOR_KEY_SHIELD_ATTRIBUTE,
  type CanvasEditorExportApi,
} from '@gruenerator/canvas-editor';
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
  it('keeps fullscreen across a parent re-render with a new onClose', async () => {
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'exitFullscreen', {
      value: exitFullscreen,
      configurable: true,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.body,
      configurable: true,
    });
    try {
      const { rerender, capturePages } = setup();
      await waitFor(() => expect(capturePages).toHaveBeenCalled());
      const exportApi = {
        current: { capturePages },
      } as unknown as RefObject<CanvasEditorExportApi | null>;
      rerender(<CanvasPresentMode exportApi={exportApi} onClose={() => {}} />);
      expect(exitFullscreen).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, 'exitFullscreen');
      Reflect.deleteProperty(document, 'fullscreenElement');
    }
  });

  it('keeps editor key handlers from seeing keys while open', async () => {
    const user = userEvent.setup();
    const editorHandler = vi.fn();
    window.addEventListener('keydown', editorHandler);
    try {
      setup();
      await screen.findByAltText('Folie 1 von 3');
      await user.keyboard('{Delete}{Backspace}{ArrowRight}');
      expect(editorHandler).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', editorHandler);
    }
  });

  it('keeps undo/redo and modifier deletes away from the editor while open', async () => {
    const user = userEvent.setup();
    const editorHandler = vi.fn();
    window.addEventListener('keydown', editorHandler);
    try {
      setup();
      const dialog = await screen.findByRole('dialog', { name: 'Präsentation' });
      await screen.findByAltText('Folie 1 von 3');
      // Das früher registrierte Seiten-Undo (Capture) erkennt das Overlay am Attribut.
      expect(dialog.hasAttribute(EDITOR_KEY_SHIELD_ATTRIBUTE)).toBe(true);
      await user.keyboard(
        '{Control>}z{/Control}{Control>}{Shift>}z{/Shift}{/Control}{Control>}y{/Control}' +
          '{Meta>}z{/Meta}{Meta>}{Backspace}{/Meta}{Control>}{Delete}{/Control}'
      );
      expect(editorHandler).not.toHaveBeenCalled();
      expect(screen.getByAltText('Folie 1 von 3')).toBeTruthy();
    } finally {
      window.removeEventListener('keydown', editorHandler);
    }
  });

  it('keeps focus on the close button and leaves Space to a focused button', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByAltText('Folie 1 von 3');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Präsentation beenden' })).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

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
