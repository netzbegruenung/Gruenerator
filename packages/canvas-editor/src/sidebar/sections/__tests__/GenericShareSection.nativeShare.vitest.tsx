import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider, type CanvasEditorServices } from '../../../CanvasEditorProvider';
import { browserFileDelivery } from '../../../hostServices';
import { GenericShareSection } from '../GenericShareSection';

const DATA_URL = 'data:image/png;base64,AAAA';
const shareDataUrlViaNativeHost = vi.fn();

const services: CanvasEditorServices = {
  fileDelivery: {
    ...browserFileDelivery,
    pickShareRoute: () => 'native-host',
    shareDataUrlViaNativeHost,
  },
};

function setup(captureCanvasImage: () => Promise<string | null>) {
  return render(
    <CanvasEditorProvider services={services}>
      <AutoSaveStoreProvider>
        <GenericShareSection
          exportedImage={null}
          shareToken={null}
          onCaptureCanvas={() => {}}
          captureCanvasImage={captureCanvasImage}
          onDownload={() => {}}
          onNavigateToGallery={() => {}}
          canvasText="Klimaschutz jetzt handeln"
          canvasType="freeform"
        />
      </AutoSaveStoreProvider>
    </CanvasEditorProvider>
  );
}

beforeEach(() => {
  shareDataUrlViaNativeHost.mockClear();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  window.matchMedia = globalThis.matchMedia;
});

describe('Nativ teilen ohne vorherigen Export', () => {
  it('teilt das frisch aufgenommene Bild', async () => {
    const capture = vi.fn().mockResolvedValue(DATA_URL);
    setup(capture);
    fireEvent.click(screen.getByRole('button', { name: 'Bild teilen' }));
    await waitFor(() => expect(shareDataUrlViaNativeHost).toHaveBeenCalled());
    expect(capture).toHaveBeenCalledTimes(1);
    expect(shareDataUrlViaNativeHost.mock.calls[0]?.[0]).toBe(DATA_URL);
  });

  it('teilt nichts, wenn die Aufnahme kein Bild liefert', async () => {
    const capture = vi.fn().mockResolvedValue(null);
    setup(capture);
    fireEvent.click(screen.getByRole('button', { name: 'Bild teilen' }));
    await waitFor(() => expect(capture).toHaveBeenCalled());
    expect(shareDataUrlViaNativeHost).not.toHaveBeenCalled();
  });
});
