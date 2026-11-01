import { ELEMENT_DRAG_TYPE, readElementDrag } from '@ggraphic/editor/utils/mediaDrop';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';
import { ElementsPanel } from '@ggraphic/editor/sidebar/sections/assets/ElementsPanel';
import { useRecentElements } from '@ggraphic/editor/sidebar/sections/assets/useRecentElements';

// jsdom has no IntersectionObserver; the grid only needs it to load the next page.
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    disconnect() {}
  }
);

beforeEach(() => {
  useRecentElements.setState({ items: [] });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

async function openEmoji(onAddAsset = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ElementsPanel onAddAsset={onAddAsset} />
    </QueryClientProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: /^Emoji/ }));
  return onAddAsset;
}

async function searchIn(text: string) {
  await userEvent.type(screen.getByRole('searchbox'), text);
}

describe('Emoji category', () => {
  it('offers the full catalogue once it has loaded, the sharepic set first', async () => {
    await openEmoji();
    expect(await screen.findByText(/^19\d\d Elemente$/)).toBeInTheDocument();
    const tiles = screen.getAllByRole('button', { name: /hinzufügen$/ });
    expect(tiles[0]).toHaveAccessibleName('Wahlurne hinzufügen');
  });

  it('adds and drags the toned variant once a skin tone is picked', async () => {
    const onAddAsset = await openEmoji();
    await userEvent.click(screen.getByRole('radio', { name: 'Dunkler Hautton' }));
    await searchIn('daumen hoch');
    const tile = await screen.findByRole(
      'button',
      { name: 'Daumen hoch hinzufügen' },
      { timeout: 1500 }
    );

    await userEvent.click(tile);
    expect(onAddAsset).toHaveBeenCalledWith('emoji-1f44d_1f3ff');

    const data: Record<string, string> = {};
    fireEvent.dragStart(tile, {
      dataTransfer: {
        setData: (type: string, value: string) => (data[type] = value),
        getData: (type: string) => data[type] ?? '',
        types: [ELEMENT_DRAG_TYPE],
        setDragImage: () => {},
        effectAllowed: '',
      },
    });
    expect(
      readElementDrag({
        types: [ELEMENT_DRAG_TYPE],
        getData: (t: string) => data[t] ?? '',
      } as never)
    ).toEqual({ kind: 'asset', assetId: 'emoji-1f44d_1f3ff' });
  });

  it('tones the sharepic set at the top of the grid as well', async () => {
    const onAddAsset = await openEmoji();
    await screen.findByText(/^19\d\d Elemente$/);
    await userEvent.click(screen.getByRole('radio', { name: 'Dunkler Hautton' }));
    await userEvent.click(screen.getByRole('button', { name: 'Schreibende Hand hinzufügen' }));
    expect(onAddAsset).toHaveBeenCalledWith('emoji-270d_1f3ff');
  });

  it('moves through the skin tones with the arrow keys, one tab stop', async () => {
    await openEmoji();
    const standard = screen.getByRole('radio', { name: 'Standard' });
    expect(standard).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Heller Hautton' })).toHaveAttribute('tabindex', '-1');

    standard.focus();
    await userEvent.keyboard('{ArrowRight}');
    const light = screen.getByRole('radio', { name: 'Heller Hautton' });
    expect(light).toBeChecked();
    expect(light).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Dunkler Hautton' })).toBeChecked();
  });

  it('has an accessible skin-tone picker', async () => {
    await openEmoji();
    const group = screen.getByRole('radiogroup', { name: 'Hautton' });
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();
    expect(await axe(group)).toHaveNoViolations();
  });
});
