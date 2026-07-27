import { type CanvasListItem } from '@gruenerator/contracts';
import { type Project } from '@gruenerator/shared';
import { type Share } from '@gruenerator/shared/share';
import { describe, expect, it } from 'vitest';

import { isKiImage, toKiImageItems, toReelItems, toSharepicItems } from './studioMediaMapping';

/**
 * The Studio tab reads three endpoints and folds them into one item shape. Three
 * things here can be wrong without anything crashing: an image landing in the
 * wrong section, a thumbnail-less item rendering as a blank plate, and the
 * canvases going missing — which is what emptied the tab for accounts whose
 * Studio content was made entirely with Vorlagen.
 */

const share = (over: Partial<Share> & Pick<Share, 'shareToken'>): Share => ({
  mediaType: 'image',
  title: 'Ein Bild',
  status: 'ready',
  createdAt: '2026-07-01T10:00:00.000Z',
  ...over,
});

const canvas = (over: Partial<CanvasListItem> & Pick<CanvasListItem, 'id'>): CanvasListItem => ({
  title: 'Ein Canvas',
  created_by: 'u1',
  created_at: '2026-06-01T10:00:00.000Z',
  updated_at: '2026-07-02T10:00:00.000Z',
  permissions: null,
  is_public: false,
  template_type: 'zitat',
  base_template_id: null,
  thumbnail_url: null,
  page_count: 1,
  format: 'square',
  ...over,
});

const project = (over: Partial<Project> & Pick<Project, 'id'>): Project => ({
  user_id: 'u1',
  title: 'Ein Reel',
  upload_id: null,
  thumbnail_path: null,
  video_path: null,
  video_metadata: null,
  video_size: 0,
  video_filename: null,
  style_preference: 'default',
  height_preference: 'default',
  mode_preference: null,
  subtitles: null,
  export_count: 0,
  last_edited_at: '2026-07-03T10:00:00.000Z',
  created_at: '2026-06-03T10:00:00.000Z',
  ...over,
});

describe('isKiImage', () => {
  it('recognises the canonical KI ids', () => {
    for (const type of ['green-edit', 'universal-edit', 'pure-create', 'ai-editor']) {
      expect(isKiImage(type)).toBe(true);
    }
  });

  it('recognises the two legacy aliases still sitting in old rows', () => {
    expect(isKiImage('imagine')).toBe(true);
    expect(isKiImage('edit')).toBe(true);
  });

  it('treats template types and unknown values as sharepics', () => {
    // Web's classifier defaults the same way, so an id neither side knows shows
    // up in the wrong section rather than vanishing from the page.
    expect(isKiImage('dreizeilen')).toBe(false);
    expect(isKiImage('zitat-at')).toBe(false);
    expect(isKiImage('was-auch-immer')).toBe(false);
    expect(isKiImage(undefined)).toBe(false);
  });
});

describe('toSharepicItems', () => {
  it('keeps canvases, which the old feed-based screen dropped entirely', () => {
    const items = toSharepicItems([], [canvas({ id: 'c1', title: 'Zitat Klimaschutz' })]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'c1', type: 'canvas', title: 'Zitat Klimaschutz' });
  });

  it('excludes KI images, which belong to the other section', () => {
    const items = toSharepicItems(
      [
        share({ shareToken: 's1', imageType: 'dreizeilen' }),
        share({ shareToken: 's2', imageType: 'pure-create' }),
      ],
      []
    );

    expect(items.map((i) => i.id)).toEqual(['s1']);
  });

  it('merges both sources newest first', () => {
    const items = toSharepicItems(
      [share({ shareToken: 's-old', createdAt: '2026-01-01T00:00:00.000Z' })],
      [canvas({ id: 'c-new', updated_at: '2026-07-20T00:00:00.000Z' })]
    );

    expect(items.map((i) => i.id)).toEqual(['c-new', 's-old']);
  });

  it('does not dedupe a share against the canvas it was exported from', () => {
    // There is no linking key between the two rows, and both are real artifacts
    // the user can open. Web merges them the same way.
    const items = toSharepicItems(
      [share({ shareToken: 'x', title: 'Zitat Klimaschutz' })],
      [canvas({ id: 'y', title: 'Zitat Klimaschutz' })]
    );

    expect(items).toHaveLength(2);
  });

  it('leaves a canvas without a thumbnail unset rather than empty', () => {
    const [item] = toSharepicItems([], [canvas({ id: 'c1', thumbnail_url: null })]);

    expect(item).toBeDefined();
    expect(item && 'thumbnailUrl' in item).toBe(false);
  });
});

describe('toKiImageItems', () => {
  it('carries the share token as the id, which is what opens the viewer', () => {
    const [item] = toKiImageItems([share({ shareToken: 'tok-123', imageType: 'pure-create' })]);

    expect(item?.id).toBe('tok-123');
    expect(item?.href).toBe('/share/tok-123');
  });

  it('falls back to the on-demand preview when no thumbnail exists yet', () => {
    // A share created seconds ago has no thumbnail until the variants pass
    // finishes; without this the freshest image is the one that renders blank.
    const [item] = toKiImageItems([share({ shareToken: 'tok', imageType: 'imagine' })]);

    expect(item?.thumbnailUrl).toBe('/api/share/tok/preview?w=400&fmt=webp');
  });

  it('prefers the real thumbnail once there is one', () => {
    const [item] = toKiImageItems([
      share({ shareToken: 'tok', imageType: 'imagine', thumbnailUrl: '/api/share/tok/thumbnail' }),
    ]);

    expect(item?.thumbnailUrl).toBe('/api/share/tok/thumbnail');
  });

  it('names an untitled share instead of rendering an empty label', () => {
    const [item] = toKiImageItems([share({ shareToken: 'tok', imageType: 'edit', title: '' })]);

    expect(item?.title).toBe('Ohne Titel');
  });
});

describe('toReelItems', () => {
  it('sorts by last edit, the same key the backend feed orders reels by', () => {
    const items = toReelItems([
      project({ id: 'alt', last_edited_at: '2026-02-01T00:00:00.000Z' }),
      project({ id: 'neu', last_edited_at: '2026-07-01T00:00:00.000Z' }),
    ]);

    expect(items.map((i) => i.id)).toEqual(['neu', 'alt']);
  });

  it('falls back to the creation date for a project never edited', () => {
    const [item] = toReelItems([
      project({ id: 'p', last_edited_at: '', created_at: '2026-03-03T00:00:00.000Z' }),
    ]);

    expect(item?.date).toBe('2026-03-03T00:00:00.000Z');
  });

  it('only points at the thumbnail route when a thumbnail was rendered', () => {
    const [withThumb] = toReelItems([project({ id: 'p1', thumbnail_path: 'thumbs/p1.jpg' })]);
    const [without] = toReelItems([project({ id: 'p2', thumbnail_path: null })]);

    expect(withThumb?.thumbnailUrl).toBe('/api/subtitler/projects/p1/thumbnail');
    expect(without && 'thumbnailUrl' in without).toBe(false);
  });
});
