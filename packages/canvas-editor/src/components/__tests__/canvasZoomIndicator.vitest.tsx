import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasEditorLayout } from '../../layouts/CanvasEditorLayout';
import { CanvasZoomIndicator } from '../CanvasMetaBar';

/**
 * Auf dem Handy fehlte jede Zoom-Anzeige (#4387): die Desktop-Leiste mit
 * Prozentwert und Knöpfen wird dort nicht gerendert. Die Pille zeigt den Zoom,
 * sobald er nicht 100 % ist, und setzt ihn per Tippen zurück.
 */
describe('CanvasZoomIndicator', () => {
  it('bleibt bei 100 % unsichtbar, auch wenn ein Pinch knapp daneben ruht', () => {
    for (const zoom of [1, 0.9981, 1.0042]) {
      const { container, unmount } = render(
        <CanvasZoomIndicator zoom={zoom} onZoomChange={vi.fn()} />
      );
      expect(container.firstChild).toBeNull();
      unmount();
    }
  });

  it('zeigt den Zoom und setzt ihn auf 100 % zurück', () => {
    const onZoomChange = vi.fn();
    render(<CanvasZoomIndicator zoom={1.4999} onZoomChange={onZoomChange} />);
    const button = screen.getByRole('button', { name: 'Zoom auf 100 % zurücksetzen' });
    expect(button.textContent).toContain('150%');
    // 36 px sichtbar, Trefferfläche per ::after 4 px rundum → 44 px
    expect(button.className).toContain('after:-inset-1');
    fireEvent.click(button);
    expect(onZoomChange).toHaveBeenCalledWith(1);
  });

  it('liegt im Layout außerhalb der scrollenden Fläche', () => {
    const { container } = render(
      <CanvasEditorLayout
        actions={null}
        mobileZoomControl={<CanvasZoomIndicator zoom={1.5} onZoomChange={vi.fn()} />}
      >
        <div />
      </CanvasEditorLayout>
    );
    const button = screen.getByRole('button', { name: 'Zoom auf 100 % zurücksetzen' });
    expect(container.querySelector('.canvas-editor-layout__main')?.contains(button)).toBe(false);
  });
});
