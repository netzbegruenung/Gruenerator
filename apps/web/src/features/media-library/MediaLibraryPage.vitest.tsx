/**
 * The inline delete confirmation swaps the edit/delete buttons for two
 * icon-only ones; without a name a screen reader announces just "button"
 * twice (#3856).
 */
import { type MediaItem } from '@gruenerator/shared/media-library';
import { describe, expect, it, vi } from 'vitest';

import { MediaCard } from './MediaLibraryPage';

import { axe, render, screen, userEvent } from '@/test-utils';

const item: MediaItem = {
  id: 'media-1',
  shareToken: 'token-1',
  mediaType: 'audio',
  title: 'Rede',
  thumbnailUrl: null,
  fileSize: 2048,
  mimeType: 'audio/mpeg',
  duration: 42,
  altText: null,
  uploadSource: 'upload',
  originalFilename: 'rede.mp3',
  downloadCount: 0,
  viewCount: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
};

describe('MediaCard delete confirmation', () => {
  it('names the edit, delete, confirm and cancel buttons', async () => {
    const { container } = render(
      <MediaCard item={item} onDelete={vi.fn().mockResolvedValue(true)} onEdit={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));

    expect(
      screen.getByRole('button', { name: 'In den Papierkorb verschieben' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
