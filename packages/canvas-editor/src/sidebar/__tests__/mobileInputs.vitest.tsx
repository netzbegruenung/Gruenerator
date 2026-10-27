import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TextField } from '../components/TextFieldPrimitives';
import { ElementsPanel } from '../sections/assets/ElementsPanel';
import { UploadsSection } from '../sections/UploadsSection';

// No host services: the galleries fall back to an empty list (hostServices.ts).
vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { initialData?: () => unknown }) => ({
    data: options.initialData?.(),
    isLoading: false,
  }),
}));
vi.mock('../UserUploadsProvider', () => ({
  useUserUploads: () => ({
    items: [],
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

describe('mobile input text size', () => {
  beforeEach(setMobileViewport);

  it('Text-Tab-Textarea bleibt auf dem Handy bei 16px', () => {
    render(
      <TextField
        config={{ id: 'headline', label: 'Titel', type: 'textarea' } as never}
        value="Hallo"
        onChange={() => {}}
        fontSize={40}
        onFontSizeChange={() => {}}
      />
    );
    expect(screen.getByRole('textbox')).toHaveClass('max-canvas-mobile:text-base');
  });

  it('Elemente-Suche: 16px und Such-Taste', () => {
    render(<ElementsPanel onAddShape={() => {}} />);
    const search = screen.getByRole('searchbox');
    expect(search).toHaveClass('max-canvas-mobile:text-base');
    expect(search).toHaveAttribute('enterkeyhint', 'search');
  });

  it('Uploads-Suche: 16px und Such-Taste', () => {
    render(<UploadsSection />);
    const search = screen.getByRole('searchbox');
    expect(search).toHaveClass('max-canvas-mobile:text-base');
    expect(search).toHaveAttribute('enterkeyhint', 'search');
  });
});
