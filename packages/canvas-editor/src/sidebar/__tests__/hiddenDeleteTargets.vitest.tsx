import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PageToolbar } from '@ggraphic/editor/components/PageToolbar';
import { UploadsSection } from '../sections/UploadsSection';

vi.mock('@ggraphic/editor/sidebar/UserUploadsProvider', () => ({
  useUserUploads: () => ({
    items: [{ id: 'm1', title: 'Foto', thumbnailUrl: '/t.jpg', originalFilename: 'foto.jpg' }],
    isLoading: false,
    error: null,
    search: '',
    setSearch: () => {},
    upload: async () => null,
    deleteFromLibrary: async () => true,
    isUploading: false,
    uploadProgress: 0,
    uploadError: null,
    hasMore: false,
    loadMore: async () => {},
  }),
}));

function setMobileViewport() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('max-width: 899px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('Löschen ohne verstecktes Ziel', () => {
  beforeEach(setMobileViewport);

  it('Upload-Löschen ist auf dem Handy sichtbar und 44pt groß', () => {
    render(<UploadsSection />);
    const del = screen.getByRole('button', { name: 'Bild aus Bibliothek entfernen' });
    expect(del).toHaveClass('max-canvas-mobile:opacity-100');
    expect(del).toHaveClass('max-canvas-mobile:size-11');
  });

  it('Upload-Löschen in der Masonry-Ansicht (breit) trägt dieselben Mobilklassen', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<UploadsSection />);
    const del = screen.getByRole('button', { name: 'Bild aus Bibliothek entfernen' });
    expect(del).toHaveClass('max-canvas-mobile:opacity-100');
    expect(del).toHaveClass('max-canvas-mobile:size-11');
  });

  function toolbar(isActive: boolean) {
    const { container } = render(
      <PageToolbar
        pageIndex={0}
        pageCount={2}
        isActive={isActive}
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
      />
    );
    return container.firstElementChild as HTMLElement;
  }

  it('PageToolbar: inaktive Seite ist auf dem Handy unsichtbar und nicht antippbar', () => {
    const el = toolbar(false);
    expect(el).toHaveClass('opacity-0');
    expect(el).toHaveClass('max-canvas-mobile:invisible');
  });

  it('PageToolbar: aktive Seite behält ihre Leiste', () => {
    const el = toolbar(true);
    expect(el).not.toHaveClass('max-canvas-mobile:invisible');
  });
});
