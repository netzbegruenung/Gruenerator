import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnnouncerContext } from '../../../hooks/useAnnounce';
import { AutoSaveStoreProvider } from '../../../stores/AutoSaveStoreProvider';
import { axe } from '../../../test-utils';
import { GenericShareSection } from '../GenericShareSection';

import type * as shared from '@gruenerator/shared';

vi.mock('@gruenerator/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof shared>()),
  pickShareRoute: () => 'web-share',
}));

const share = vi.fn().mockResolvedValue(undefined);
const writeText = vi.fn().mockResolvedValue(undefined);
const announce = vi.fn();

function setup(imageText = 'Klimaschutz jetzt handeln') {
  return render(
    <AnnouncerContext.Provider value={{ announce, lastAnnouncedAt: { current: 0 } }}>
      <AutoSaveStoreProvider>
        <GenericShareSection
          exportedImage="data:image/png;base64,AAAA"
          shareToken={null}
          onCaptureCanvas={() => {}}
          onDownload={() => {}}
          onNavigateToGallery={() => {}}
          canvasText="Klimaschutz jetzt handeln\nFoto: A / Unsplash"
          imageText={imageText}
          canvasType="freeform"
        />
      </AutoSaveStoreProvider>
    </AnnouncerContext.Provider>
  );
}

beforeEach(() => {
  share.mockClear();
  writeText.mockClear();
  announce.mockClear();
  Object.assign(navigator, { share, clipboard: { writeText } });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  window.matchMedia = globalThis.matchMedia;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ blob: async () => new Blob(['x'], { type: 'image/png' }) })
  );
});

describe('Alt-Text beim Teilen und Herunterladen', () => {
  it('ist aus dem Leinwandtext vorbelegt, ohne den Bildnachweis', () => {
    setup();
    expect(screen.getByRole('textbox', { name: 'Bildbeschreibung (Alt-Text)' })).toHaveValue(
      'Sharepic mit dem Text: Klimaschutz jetzt handeln.'
    );
  });

  it('ist bearbeitbar', async () => {
    setup();
    const field = screen.getByRole('textbox', { name: 'Bildbeschreibung (Alt-Text)' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Eigene Beschreibung');
    expect(field).toHaveValue('Eigene Beschreibung');
  });

  it('kopiert den Alt-Text und sagt es an', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Alt-Text kopieren' }));
    expect(writeText).toHaveBeenCalledWith('Sharepic mit dem Text: Klimaschutz jetzt handeln.');
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Alt-Text kopiert'));
  });

  it('hängt den Alt-Text als eigene Zeile an den Teilen-Text', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Bild teilen' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect((share.mock.calls[0]?.[0] as { text: string }).text).toBe(
      'Klimaschutz jetzt handeln\\nFoto: A / Unsplash\nBildbeschreibung: Sharepic mit dem Text: Klimaschutz jetzt handeln.'
    );
  });

  it('hängt nichts an, wenn das Feld geleert wurde', async () => {
    setup();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Bildbeschreibung (Alt-Text)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bild teilen' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect((share.mock.calls[0]?.[0] as { text: string }).text).not.toContain('Bildbeschreibung');
  });

  it('behält die Bearbeitung, wenn der Abschnitt neu eingehängt wird', async () => {
    const section = (
      <GenericShareSection
        exportedImage={null}
        shareToken={null}
        onCaptureCanvas={() => {}}
        onDownload={() => {}}
        onNavigateToGallery={() => {}}
        canvasText="x"
        imageText="x"
        canvasType="freeform"
      />
    );
    const tree = (show: boolean) => (
      <AutoSaveStoreProvider>{show ? section : <p>anderer Tab</p>}</AutoSaveStoreProvider>
    );
    const { rerender } = render(tree(true));
    const field = () => screen.getByRole('textbox', { name: 'Bildbeschreibung (Alt-Text)' });
    await userEvent.clear(field());
    await userEvent.type(field(), 'Meine Version');
    rerender(tree(false));
    expect(screen.queryByRole('textbox')).toBeNull();
    rerender(tree(true));
    expect(field()).toHaveValue('Meine Version');
  });

  it('hat keine axe-Verstöße', async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});
