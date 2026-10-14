import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCanvasChatDraftId } from './CanvasChatDocContext';
import { WebCanvasEditorProvider } from './WebCanvasEditorProvider';

function DraftId() {
  return <span data-testid="draft">{useCanvasChatDraftId()}</span>;
}

describe('WebCanvasEditorProvider', () => {
  it('hält den Entwurfsschlüssel des Chats über Remounts des Abschnitts (#4273)', () => {
    const { rerender } = render(
      <WebCanvasEditorProvider>
        <DraftId key="a" />
      </WebCanvasEditorProvider>
    );
    const first = screen.getByTestId('draft').textContent;
    expect(first).toBeTruthy();
    rerender(
      <WebCanvasEditorProvider>
        <DraftId key="b" />
      </WebCanvasEditorProvider>
    );
    expect(screen.getByTestId('draft').textContent).toBe(first);
  });
});
