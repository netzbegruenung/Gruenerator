import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test-utils';

import StudioGallerySections from './StudioGallerySections';

import type { RecentGalleryItem } from '../hooks/useRecentGalleryItems';

const navigate = vi.fn();
const items: RecentGalleryItem[] = [];

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
}));
vi.mock('../hooks/useRecentGalleryItems', () => ({
  useRecentGalleryItems: () => ({ items, lastFetch: 1, refresh: vi.fn() }),
}));
vi.mock('../hooks/useRecentCanvases', () => ({
  useRecentCanvases: () => ({ data: [], isFetched: true }),
}));
vi.mock('../canvasQuery', () => ({ useCanvasEditorPrefetch: () => vi.fn() }));
vi.mock('../../workplace/components/ReelsSection', () => ({ default: () => null }));
vi.mock('../../../components/common/SharedMediaImage', () => ({ SharedMediaImage: () => null }));

function share(title: string, sharepicType: string): RecentGalleryItem {
  return {
    shareToken: `tok-${title}`,
    title,
    imageType: 'sharepic',
    contentOrigin: 'sharepic',
    createdAt: '2026-10-01T10:00:00.000Z',
    imageMetadata: { sharepicType, content: { line1: 'x' } },
  };
}

describe('StudioGallerySections share click', () => {
  it('opens the read-only preview for a canvas-made share and /vorlagen for a wizard share', async () => {
    items.splice(0, items.length, share('Freeform', 'freeform'), share('Dreizeilen', 'dreizeilen'));
    const { user } = renderWithProviders(<StudioGallerySections />);

    await user.click(screen.getByRole('button', { name: 'Freeform' }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Lightbox schließen' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Lightbox schließen' }));
    await user.click(screen.getByRole('button', { name: 'Dreizeilen' }));
    expect(navigate).toHaveBeenCalledWith('/vorlagen');
  });
});
