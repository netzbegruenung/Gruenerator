import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AutoSaveStoreProvider } from '../../../stores/AutoSaveStoreProvider';
import { ShareDropdown } from '../ShareDropdown';

vi.mock('@gruenerator/shared', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  pickShareRoute: () => 'web-share',
}));

const share = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  share.mockClear();
  Object.assign(navigator, { share, clipboard: { writeText: vi.fn() } });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ blob: async () => new Blob(['x'], { type: 'image/png' }) })
  );
});

async function openMenu() {
  render(
    <AutoSaveStoreProvider>
      <ShareDropdown
        onCaptureCanvas={() => Promise.resolve('data:image/png;base64,aGVsbG8=')}
        onDownload={() => {}}
        onNavigateToGallery={() => {}}
        canvasText="Klimaschutz jetzt"
        canvasType="dreizeilen"
        canvasWidth={1080}
        canvasHeight={1080}
        shareToken={null}
      />
    </AutoSaveStoreProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Teilen' }));
}

const field = () => screen.getByRole('textbox', { name: 'Bildbeschreibung (Alt-Text)' });
const sharedText = () => (share.mock.calls[0]?.[0] as { text: string }).text;

describe('Alt-Text im Teilen-Menü der Leiste', () => {
  it('hängt den Alt-Text als Zeile an den geteilten Text', async () => {
    await openMenu();
    expect(field()).toHaveValue('Sharepic mit dem Text: Klimaschutz jetzt.');
    await userEvent.clear(field());
    await userEvent.type(field(), 'Zwei Bäume');
    fireEvent.click(screen.getAllByRole('button', { name: 'Teilen' }).at(-1)!);
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(sharedText()).toBe('Klimaschutz jetzt\nBildbeschreibung: Zwei Bäume');
  });

  it('lässt die Zeile weg, wenn das Feld geleert wurde', async () => {
    await openMenu();
    await userEvent.clear(field());
    fireEvent.click(screen.getAllByRole('button', { name: 'Teilen' }).at(-1)!);
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(sharedText()).toBe('Klimaschutz jetzt');
  });
});
