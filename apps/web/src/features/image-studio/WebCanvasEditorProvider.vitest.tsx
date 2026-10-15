import { useCanvasEditorServices } from '@gruenerator/canvas-editor';
import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '../../test-utils';

import { useCanvasChatDraftId } from './CanvasChatDocContext';
import { WebCanvasEditorProvider } from './WebCanvasEditorProvider';

function DraftId() {
  return <span data-testid="draft">{useCanvasChatDraftId()}</span>;
}

function StickerCreator() {
  const { openStickerCreator } = useCanvasEditorServices();
  return <span data-testid="creator">{openStickerCreator ? 'ja' : 'nein'}</span>;
}

function Vorlagen() {
  const { vorlagen } = useCanvasEditorServices();
  return <span data-testid="print">{vorlagen?.openPrintAsNew ? 'ja' : 'nein'}</span>;
}

describe('WebCanvasEditorProvider', () => {
  it('öffnet Print-Vorlagen als neues Design, außer wo Vorlagen gesperrt sind', () => {
    const { rerender } = renderWithProviders(
      <WebCanvasEditorProvider>
        <Vorlagen />
      </WebCanvasEditorProvider>
    );
    expect(screen.getByTestId('print').textContent).toBe('ja');
    rerender(
      <WebCanvasEditorProvider allowVorlagen={false}>
        <Vorlagen />
      </WebCanvasEditorProvider>
    );
    expect(screen.getByTestId('print').textContent).toBe('nein');
  });

  it('bietet den Sticker-Ersteller an, außer im WebView-Host /mobile-editor', () => {
    const { rerender } = renderWithProviders(
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
    const { rerender } = renderWithProviders(
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
