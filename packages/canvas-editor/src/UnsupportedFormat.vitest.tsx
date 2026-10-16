import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ControllableCanvasWrapper } from './CanvasEditorRouter';

describe('ControllableCanvasWrapper mit unbekanntem Druckformat', () => {
  it('öffnet den Editor nicht und bittet um ein App-Update', () => {
    const onStateChange = vi.fn();
    render(
      <ControllableCanvasWrapper
        type="freeform"
        formatId="print-a5-quer"
        initialState={{}}
        onExport={vi.fn()}
        onCancel={vi.fn()}
        onStateChange={onStateChange}
        chromeLeft={<button type="button">Zurück</button>}
      />
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Format nicht unterstützt – bitte App aktualisieren'
    );
    expect(screen.getByRole('button', { name: 'Zurück' })).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Editor wird geladen' })).toBeNull();
    expect(onStateChange).not.toHaveBeenCalled();
  });
});
