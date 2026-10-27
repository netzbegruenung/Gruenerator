import fs from 'node:fs';
import path from 'node:path';

import { getAssetById, resolveAssetInstanceSrc } from '@ggraphic/editor/utils/canvasAssets';
import { describe, expect, it } from 'vitest';

import { EMOJI_ASSETS } from '../../brand/grueneAssetCatalog';

import { loadEmojiCatalog, withTone } from './emojiCatalog';

const PUBLIC_DIR = path.resolve(import.meta.dirname, '../../../../../apps/web/public');

describe('emoji catalogue', () => {
  it('has a vendored file for every emoji and tone, and no file without an emoji', async () => {
    const groups = await loadEmojiCatalog();
    const srcs = groups.flatMap((g) =>
      g.emoji.flatMap((e) => [e.src, ...[1, 2, 3, 4, 5].map((t) => withTone(e, t).src)])
    );
    const referenced = new Set(srcs.map((src) => path.basename(src)));
    const files = fs.readdirSync(path.join(PUBLIC_DIR, 'emoji')).filter((f) => f.endsWith('.svg'));

    expect(referenced.size).toBeGreaterThan(3000);
    expect([...referenced].filter((f) => !files.includes(f))).toEqual([]);
    expect(files.filter((f) => !referenced.has(f))).toEqual([]);
  });

  it('contains the sharepic set with its campaign tags', async () => {
    const all = new Map((await loadEmojiCatalog()).flatMap((g) => g.emoji).map((e) => [e.id, e]));
    for (const curated of EMOJI_ASSETS) {
      expect(all.get(curated.id)?.tags).toEqual(expect.arrayContaining(curated.tags));
    }
  });

  it('draws a toned emoji with its own file and keeps tone-less ones', async () => {
    const all = (await loadEmojiCatalog()).flatMap((g) => g.emoji);
    const thumbsUp = all.find((e) => e.id === 'emoji-1f44d')!;
    expect(withTone(thumbsUp, 5).src).toBe('/emoji/emoji_u1f44d_1f3ff.svg');
    const globe = all.find((e) => e.id === 'emoji-1f30d')!;
    expect(withTone(globe, 3)).toBe(globe);
  });
});

describe('emoji asset ids', () => {
  it('resolves any emoji id without the catalogue', () => {
    expect(getAssetById('emoji-1f600')).toMatchObject({
      src: '/emoji/emoji_u1f600.svg',
      label: '😀',
      category: 'emoji',
    });
    expect(
      resolveAssetInstanceSrc({ assetId: 'emoji-1f9d1_1f3fb_200d_1f91d_200d_1f9d1_1f3fb' })
    ).toBe('/emoji/emoji_u1f9d1_1f3fb_200d_1f91d_200d_1f9d1_1f3fb.svg');
  });

  it('keeps curated names for the sharepic set', () => {
    expect(getAssetById('emoji-1f5f3')?.label).toBe('Wahlurne');
  });

  it('does not let persisted ids point outside /emoji/', () => {
    for (const id of ['emoji-../x', 'emoji-1f600.svg', 'emoji-', 'emoji-1F600', 'emoji-1f600_']) {
      expect(getAssetById(id)).toBeUndefined();
    }
  });
});
