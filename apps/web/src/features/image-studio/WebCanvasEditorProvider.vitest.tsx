import { useCanvasEditorServices } from '@gruenerator/canvas-editor';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCanvasChatDraftId } from './CanvasChatDocContext';
import { WebCanvasEditorProvider } from './WebCanvasEditorProvider';

function DraftId() {
  return <span data-testid="draft">{useCanvasChatDraftId()}</span>;
}

function StickerCreator() {
  const { openStickerCreator } = useCanvasEditorServices();
  return <span data-testid="creator">{openStickerCreator ? 'ja' : 'nein'}</span>;
}

describe('WebCanvasEditorProvider', () => {
  it('bietet den Sticker-Ersteller an, außer im WebView-Host /mobile-editor', () => {
    const { rerender } = render(
      <WebCanvasEditorProvider>
        <StickerCreator />
      </WebCanvasEditorProvider>
    );
    expect(screen.getByTestId('creator').textContent).toBe('ja');
    rerender(
      <WebCanvasEditorProvider allowStickerCreator={false}>
        <StickerCreator />
      </WebCanvasEditorProvider>
    );
    expect(screen.getByTestId('creator').textContent).toBe('nein');
  });

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
