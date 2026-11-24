import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test-utils';

import RecentlyCreatedSection from './RecentlyCreatedSection';

import type { RecentItem } from '../hooks/useRecentActivity';

const navigate = vi.fn();
const items: RecentItem[] = [];
let loading = false;

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
}));
vi.mock('../hooks/useRecentActivity', () => ({
  useRecentActivity: () => ({ data: items, isLoading: loading, isError: false, refetch: vi.fn() }),
}));
vi.mock('../../../hooks/useBoardsTyped', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBoardsTyped: () => ({ deleteBoard: vi.fn() }),
}));
vi.mock('../../image-studio/canvasEditorPrefetch', () => ({
  useCanvasEditorPrefetch: () => vi.fn(),
}));
vi.mock('../../../components/common/SharedMediaImage', () => ({ SharedMediaImage: () => null }));

const image = (id: string, title: string, editor?: 'profilbild'): RecentItem => ({
  id,
  title,
  date: '2026-10-11T10:00:00.000Z',
  type: 'image',
  href: `/share/${id}`,
  ...(editor ? { editor } : {}),
});

describe('RecentlyCreatedSection image cards', () => {
  it('reopens a saved Profilbild in its editor and labels it as one', async () => {
    items.splice(0, items.length, image('pb-1', 'Mein Profilbild', 'profilbild'));
    const { user } = renderWithProviders(<RecentlyCreatedSection />);

    expect(screen.getByText(/^Profilbild · /)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Mein Profilbild' }));
    expect(navigate).toHaveBeenCalledWith('/studio/profilbild?share=pb-1');
  });

  it('keeps every other image on the lightbox', async () => {
    navigate.mockClear();
    items.splice(0, items.length, image('img-1', 'Urlaub'));
    const { user } = renderWithProviders(<RecentlyCreatedSection />);

    expect(screen.getByText(/^Bild · /)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Urlaub' }));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('RecentlyCreatedSection canvas cards', () => {
  // #4732: a thumbnail whose file is missing 404s; the card must not show a broken image.
  it('falls back to the placeholder when the thumbnail fails to load', () => {
    items.splice(0, items.length, {
      id: 'c-1',
      title: 'Plakat',
      date: '2026-10-11T10:00:00.000Z',
      type: 'canvas',
      href: '/studio/canvas/c-1',
      thumbnailUrl: '/api/thumbs/canvas/c-1/v1?sig=x&w=400&fmt=webp',
    });
    renderWithProviders(<RecentlyCreatedSection />);

    const img = screen.getByRole('img', { name: 'Plakat' });
    expect(screen.queryByText('Bild-Vorschau')).toBeNull();
    fireEvent.error(img);
    expect(screen.queryByRole('img', { name: 'Plakat' })).toBeNull();
    expect(screen.getByText('Bild-Vorschau')).toBeTruthy();
  });
});

describe('RecentlyCreatedSection layout', () => {
  it('reports the expanded state on the toggle button', async () => {
    loading = false;
    // jsdom has no grid layout: columns fall back to 2 (phone), so 5 items overflow two rows.
    items.splice(
      0,
      items.length,
      ...['a', 'b', 'c', 'd', 'e'].map((id) => image(id, id.toUpperCase()))
    );
    const { user } = renderWithProviders(<RecentlyCreatedSection />);

    const toggle = screen.getByRole('button', { name: 'Mehr anzeigen' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).toBeTruthy();
    await user.click(toggle);
    expect(
      screen.getByRole('button', { name: 'Weniger anzeigen' }).getAttribute('aria-expanded')
    ).toBe('true');
  });

  it('shows two rows on a phone and doubles them with „Mehr anzeigen"', async () => {
    loading = false;
    const ids = Array.from({ length: 10 }, (_, i) => `i${i}`);
    items.splice(0, items.length, ...ids.map((id) => image(id, id.toUpperCase())));
    const { user } = renderWithProviders(<RecentlyCreatedSection />);

    expect(screen.getAllByRole('button', { name: /^I\d$/ })).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Mehr anzeigen' }));
    expect(screen.getAllByRole('button', { name: /^I\d$/ })).toHaveLength(8);
  });

  it('renders two rows of skeletons (phone fallback of 2 columns when unmeasured)', () => {
    loading = true;
    const { container } = renderWithProviders(<RecentlyCreatedSection />);
    loading = false;

    expect(container.querySelectorAll('section > .grid > div')).toHaveLength(4);
  });
});
