import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider, type CanvasEditorServices } from '../../../CanvasEditorProvider';
import { axe } from '../../../test-utils';

import { ToolsSection } from './ToolsSection';
import { UnsplashTool } from './UnsplashTool';

import type { StockImage } from '../../../common/imageSourceTypes';

const photo = (n: number): StockImage => ({
  filename: `annie-${n}-unsplash.jpg`,
  url: `https://images.unsplash.com/photo-${n}?ixid=x`,
  alt_text: `Windrad ${n}`,
  attribution: {
    photographer: `Annie Spratt ${n}`,
    profileUrl: `https://unsplash.com/@annie${n}?utm_source=gruenerator&utm_medium=referral`,
    photoUrl: `https://unsplash.com/photos/${n}?utm_source=gruenerator&utm_medium=referral`,
    downloadLocation: `https://api.unsplash.com/photos/${n}/download`,
  },
});

function setup(total = 3) {
  const searchUnsplashImages = vi.fn(async (_q: string, page = 1) => ({
    results: page === 1 ? [photo(1), photo(2)] : [photo(3)],
    total,
    total_pages: 2,
  }));
  const trackUnsplashDownloadLive = vi.fn(async () => {});
  const uploadImage = vi.fn(async () => 'https://example.org/copy');
  const onPlaceImageUrl = vi.fn();
  const services: CanvasEditorServices = {
    searchUnsplashImages,
    trackUnsplashDownloadLive,
    uploadImage,
  };
  const view = render(
    <CanvasEditorProvider services={services}>
      <UnsplashTool onPlaceImageUrl={onPlaceImageUrl} />
    </CanvasEditorProvider>
  );
  return {
    ...view,
    searchUnsplashImages,
    trackUnsplashDownloadLive,
    uploadImage,
    onPlaceImageUrl,
  };
}

async function search(term: string) {
  await userEvent.type(screen.getByRole('searchbox', { name: 'Fotos auf Unsplash suchen' }), term);
  await screen.findByRole('button', { name: 'Foto einfügen: Windrad 1' }, { timeout: 2000 });
}

describe('UnsplashTool', () => {
  it('shows results with the photographer credited and linked', async () => {
    const { searchUnsplashImages } = setup();
    await search('windrad');
    expect(searchUnsplashImages).toHaveBeenLastCalledWith('windrad', 1, 20);
    const credit = screen.getByRole('link', { name: 'Annie Spratt 1' });
    expect(credit).toHaveAttribute(
      'href',
      'https://unsplash.com/@annie1?utm_source=gruenerator&utm_medium=referral'
    );
    expect(screen.getByRole('link', { name: 'Unsplash' }).getAttribute('href')).toContain(
      'utm_source=gruenerator&utm_medium=referral'
    );
  });

  it('places the hotlinked photo with its credit and tracks the download, without uploading it', async () => {
    const { onPlaceImageUrl, trackUnsplashDownloadLive, uploadImage } = setup();
    await search('windrad');
    await userEvent.click(screen.getByRole('button', { name: 'Foto einfügen: Windrad 2' }));

    expect(trackUnsplashDownloadLive).toHaveBeenCalledWith(
      'https://api.unsplash.com/photos/2/download'
    );
    expect(onPlaceImageUrl).toHaveBeenCalledWith(
      'https://images.unsplash.com/photo-2?ixid=x',
      'annie-2-unsplash.jpg',
      photo(2).attribution
    );
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('loads the next page on "Mehr laden" and hides it once everything is shown', async () => {
    const { searchUnsplashImages } = setup(3);
    await search('windrad');
    await userEvent.click(screen.getByRole('button', { name: 'Mehr laden (2 von 3)' }));
    await screen.findByRole('button', { name: 'Foto einfügen: Windrad 3' });
    expect(searchUnsplashImages).toHaveBeenLastCalledWith('windrad', 2, 20);
    expect(screen.queryByRole('button', { name: /Mehr laden/ })).toBeNull();
  });

  it('thumbnails use a resized copy of the same hotlinked URL', async () => {
    const { container } = setup();
    await search('windrad');
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://images.unsplash.com/photo-1?ixid=x&w=400');
  });

  it('has no axe violations with results', async () => {
    const { container } = setup();
    await search('windrad');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('ToolsSection', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  it('offers the Unsplash tool only when search and placement are wired', () => {
    const services: CanvasEditorServices = { searchUnsplashImages: vi.fn() };
    const { rerender } = render(
      <CanvasEditorProvider services={services}>
        <ToolsSection onPlaceImageUrl={vi.fn()} />
      </CanvasEditorProvider>
    );
    expect(screen.getByRole('button', { name: 'Unsplash-Fotos' })).toBeInTheDocument();

    rerender(
      <CanvasEditorProvider services={{}}>
        <ToolsSection onPlaceImageUrl={vi.fn()} />
      </CanvasEditorProvider>
    );
    expect(screen.queryByRole('button', { name: 'Unsplash-Fotos' })).toBeNull();
  });
});
