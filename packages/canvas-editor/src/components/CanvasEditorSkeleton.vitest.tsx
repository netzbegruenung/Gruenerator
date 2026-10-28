import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CanvasEditorSkeleton } from '@ggraphic/editor/components/CanvasEditorSkeleton';

describe('CanvasEditorSkeleton', () => {
  it('announces itself as one busy status region', () => {
    render(<CanvasEditorSkeleton />);
    const status = screen.getByRole('status', { name: 'Editor wird geladen' });
    expect(status.getAttribute('aria-busy')).toBe('true');
  });

  it('keeps the host back button usable while loading', () => {
    render(<CanvasEditorSkeleton chromeLeft={<button type="button">Zurück</button>} />);
    expect(screen.getByRole('button', { name: 'Zurück' })).toBeTruthy();
  });

  it('leaves the bar to a host that draws it natively', () => {
    const withBar = render(
      <CanvasEditorSkeleton chromeLeft={<button type="button">Zurück</button>} />
    );
    expect(withBar.container.querySelector('[class*="editor-menubar-gradient"]')).not.toBeNull();
    withBar.unmount();
    const { container } = render(
      <CanvasEditorSkeleton chromeLeft={<button type="button">Zurück</button>} topBar={false} />
    );
    expect(container.querySelector('[class*="editor-menubar-gradient"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull();
  });

  it('sizes the page placeholder to the template format', () => {
    const { container } = render(<CanvasEditorSkeleton aspectRatio={0.8} />);
    const page = container.querySelector<HTMLElement>('[style*="aspect-ratio"]');
    expect(page?.style.aspectRatio).toMatch(/^0\.8\b/);
  });
});
