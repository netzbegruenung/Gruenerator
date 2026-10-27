import {
  grueneratorPrint,
  useCanvasEditorServices,
  type CanvasEditorServices,
} from '@gruenerator/canvas-editor';
import {
  downloadBlob,
  downloadDataUrl,
  pickShareRoute,
  shareDataUrlViaNativeHost,
} from '@gruenerator/shared';
import { useUnsplashSearch } from '@gruenerator/shared/image-studio';
import { useMediaLibrary, useMediaUpload } from '@gruenerator/shared/media-library';
import { MediaThumb } from '@gruenerator/shared/media-library/ui';
import { shareApi } from '@gruenerator/shared/share';
import { useStudioAssets } from '@gruenerator/shared/studio-assets';
import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '../../test-utils';

import { useCanvasChatDraftId } from './CanvasChatDocContext';
import { WebCanvasEditorProvider } from './WebCanvasEditorProvider';

function DraftId() {
  return <span data-testid="draft">{useCanvasChatDraftId()}</span>;
}

function Vorlagen() {
  const { vorlagen } = useCanvasEditorServices();
  return <span data-testid="vorlagen">{vorlagen ? 'ja' : 'nein'}</span>;
}

function StickerCreator() {
  const { openStickerCreator } = useCanvasEditorServices();
  return <span data-testid="creator">{openStickerCreator ? 'ja' : 'nein'}</span>;
}

function PrintVorlagen() {
  const { vorlagen } = useCanvasEditorServices();
  return <span data-testid="print">{vorlagen?.openPrintAsNew ? 'ja' : 'nein'}</span>;
}

function ExpandImage() {
  const { expandImage } = useCanvasEditorServices();
  return <span data-testid="expand">{expandImage ? 'ja' : 'nein'}</span>;
}

let seen: CanvasEditorServices | null = null;
function Capture() {
  seen = useCanvasEditorServices();
  return null;
}

describe('WebCanvasEditorProvider', () => {
  it.each([
    ['Image Studio', {}],
    ['/mobile-editor', { allowStickerCreator: false, allowVorlagen: false }],
  ])('reicht in %s die Dienste aus @gruenerator/shared in den Editor', (_host, props) => {
    renderWithProviders(
      <WebCanvasEditorProvider {...props}>
        <Capture />
      </WebCanvasEditorProvider>
    );
    expect(seen?.mediaLibrary).toEqual({ useMediaLibrary, useMediaUpload, MediaThumb });
    expect(seen?.fileDelivery).toEqual({
      downloadBlob,
      downloadDataUrl,
      pickShareRoute,
      shareDataUrlViaNativeHost,
    });
    expect(seen?.imageShares?.publishShare).toBe(shareApi.publishShare);
    expect(seen?.useStudioAssets).toBe(useStudioAssets);
    expect(seen?.useUnsplashSearch).toBe(useUnsplashSearch);
    expect(seen?.print).toBe(grueneratorPrint);
  });

  it('reicht „Erweitern" in den Editor, auch im WebView-Host /mobile-editor', () => {
    const { rerender } = renderWithProviders(
      <WebCanvasEditorProvider>
        <ExpandImage />
      </WebCanvasEditorProvider>
    );
    expect(screen.getByTestId('expand').textContent).toBe('ja');
    rerender(
      <WebCanvasEditorProvider allowStickerCreator={false} allowVorlagen={false}>
        <ExpandImage />
      </WebCanvasEditorProvider>
    );
    expect(screen.getByTestId('expand').textContent).toBe('ja');
  });

  it('öffnet Print-Vorlagen als neues Design, außer wo Vorlagen gesperrt sind', () => {
    const { rerender } = renderWithProviders(
      <WebCanvasEditorProvider>
        <PrintVorlagen />
      </WebCanvasEditorProvider>
    );
    expect(screen.getByTestId('print').textContent).toBe('ja');
    rerender(
      <WebCanvasEditorProvider allowVorlagen={false}>
        <PrintVorlagen />
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

  it('bietet die Vorlagen an, außer wo das Design nicht verändert werden darf', () => {
    const { rerender } = renderWithProviders(
      <WebCanvasEditorProvider>
        <Vorlagen />
      </WebCanvasEditorProvider>
    );
    expect(screen.getByTestId('vorlagen').textContent).toBe('ja');
    rerender(
      <WebCanvasEditorProvider allowVorlagen={false}>
        <Vorlagen />
      </WebCanvasEditorProvider>
    );
    expect(screen.getByTestId('vorlagen').textContent).toBe('nein');
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
