import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const editorProps = vi.fn();
vi.mock('./components/CanvasEditor', () => ({
  CanvasEditor: (props: Record<string, unknown>) => {
    editorProps(props);
    return null;
  },
}));

import { ControllableCanvasWrapper } from './CanvasEditorRouter';

describe('documentTitle wiring', () => {
  it('hands the host document title to the editor that names the print PDF', async () => {
    render(
      <ControllableCanvasWrapper
        type="freeform"
        formatId="print-a3-hoch"
        documentTitle="Wahlplakat Wien"
        initialState={{}}
        onExport={vi.fn()}
        onCancel={vi.fn()}
        onStateChange={vi.fn()}
      />
    );
    await waitFor(
      () =>
        expect(editorProps).toHaveBeenCalledWith(
          expect.objectContaining({ documentTitle: 'Wahlplakat Wien' })
        ),
      { timeout: 20000 }
    );
  }, 25000);
});
