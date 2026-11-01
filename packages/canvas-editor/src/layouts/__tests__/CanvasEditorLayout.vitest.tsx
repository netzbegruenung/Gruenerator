/**
 * Die untere Leiste („+ Seite hinzufügen", Zoom) lag bei offenem Panel über
 * dessen unterem Rand und damit über dem Chat-Composer (#4274).
 */
import { CanvasEditorLayout } from '@ggraphic/editor/shell';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('CanvasEditorLayout bottom bar', () => {
  it('rückt um die Breite des offenen Panels ein', () => {
    const { container } = render(
      <CanvasEditorLayout
        actions={null}
        tabBar={<div />}
        sidebar={<div />}
        bottomBar={<button type="button">Seite hinzufügen</button>}
      >
        <div />
      </CanvasEditorLayout>
    );
    const bar = container.querySelector('.canvas-editor-layout__bottom-bar');
    // Positioned inside the editor's root since ggraphic alpha.2 (#105): no host inset any more.
    expect(bar?.className).toContain(
      'left-[calc(var(--image-studio-tab-bar-width)_+_var(--canvas-panel-width,0px))]'
    );
    expect(bar?.className).toContain('transition-[left]');
  });
});
