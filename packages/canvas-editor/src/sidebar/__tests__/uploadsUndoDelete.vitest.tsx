import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UserUploadsProvider, useUserUploads } from '../UserUploadsProvider';

/**
 * Löschen in den Uploads: auf dem Handy eine dauerhafte Ecke jeder Kachel, die
 * selbst Antippen-zum-Platzieren ist. Das Bild verschwindet sofort, gelöscht
 * wird erst nach dem Rückgängig-Fenster.
 */

const deleteItem = vi.fn(async () => true);
const items = [
  { id: 'a', title: 'A' },
  { id: 'b', title: 'B' },
];

vi.mock('@gruenerator/shared/media-library', () => ({
  useMediaLibrary: () => ({
    items,
    isLoading: false,
    error: null,
    pagination: { hasMore: false },
    loadMore: async () => {},
    setFilters: () => {},
    deleteItem,
  }),
  useMediaUpload: () => ({
    upload: async () => null,
    isUploading: false,
    progress: 0,
    error: null,
  }),
}));

const toast = vi.fn<(...args: unknown[]) => void>();
vi.mock('@gruenerator/ui', () => ({ toast: (...args: unknown[]) => toast(...args) }));

function Probe() {
  const { items: visible, deleteFromLibrary } = useUserUploads();
  return (
    <>
      <p>{visible.map((i) => i.id).join(',')}</p>
      <button type="button" onClick={() => deleteFromLibrary('a')}>
        löschen
      </button>
    </>
  );
}

function undo() {
  const options = toast.mock.calls.at(-1)?.[1] as { action: { onClick: () => void } };
  act(() => options.action.onClick());
}

describe('Uploads löschen mit Rückgängig', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    deleteItem.mockClear();
    toast.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('blendet sofort aus und löscht erst nach dem Fenster', () => {
    render(
      <UserUploadsProvider>
        <Probe />
      </UserUploadsProvider>
    );
    act(() => screen.getByRole('button', { name: 'löschen' }).click());

    expect(screen.getByText('b')).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(
      'Bild gelöscht',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Rückgängig' }) })
    );
    expect(deleteItem).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(deleteItem).toHaveBeenCalledWith('a');
  });

  it('„Rückgängig“ holt das Bild zurück und löscht nichts', () => {
    render(
      <UserUploadsProvider>
        <Probe />
      </UserUploadsProvider>
    );
    act(() => screen.getByRole('button', { name: 'löschen' }).click());
    undo();

    expect(screen.getByText('a,b')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it('führt ein offenes Löschen aus, wenn der Editor vorher schließt', () => {
    const { unmount } = render(
      <UserUploadsProvider>
        <Probe />
      </UserUploadsProvider>
    );
    act(() => screen.getByRole('button', { name: 'löschen' }).click());
    unmount();
    expect(deleteItem).toHaveBeenCalledWith('a');
  });
});
