import { SOCIAL_PLATFORM_INFO } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { buildSocialPostView, COLLAPSE_THRESHOLD, splitPostText } from './socialPostView';

import type { SocialPostPayload } from '@gruenerator/contracts';

function post(overrides: Partial<SocialPostPayload> = {}): SocialPostPayload {
  return {
    postId: 'p1',
    platform: 'instagram',
    text: 'Mehr Photovoltaik auf jedes Dach. #Klimaschutz',
    hashtags: ['#Klimaschutz'],
    charCount: 46,
    version: 1,
    ...overrides,
  };
}

describe('splitPostText', () => {
  it('separates hashtags from the surrounding prose', () => {
    expect(splitPostText('Jetzt handeln #Klimaschutz und zwar sofort')).toEqual([
      { text: 'Jetzt handeln ', isHashtag: false },
      { text: '#Klimaschutz', isHashtag: true },
      { text: ' und zwar sofort', isHashtag: false },
    ]);
  });

  it('keeps umlauts inside the tag', () => {
    expect(splitPostText('#Grüne')).toEqual([{ text: '#Grüne', isHashtag: true }]);
  });

  it('ends the tag at punctuation', () => {
    expect(splitPostText('#Klimaschutz!')).toEqual([
      { text: '#Klimaschutz', isHashtag: true },
      { text: '!', isHashtag: false },
    ]);
  });

  it('leaves a bare hash alone', () => {
    expect(splitPostText('Kosten # pro Jahr')).toEqual([
      { text: 'Kosten # pro Jahr', isHashtag: false },
    ]);
  });

  it('emits no empty segments', () => {
    const segments = splitPostText('#a#b');

    expect(segments.every((s) => s.text !== '')).toBe(true);
    expect(segments).toHaveLength(2);
  });
});

describe('buildSocialPostView', () => {
  it('names the platform in the title', () => {
    expect(buildSocialPostView(post()).title).toBe('Instagram-Post');
  });

  it('stays generic for the generic platform rather than saying "Generic-Post"', () => {
    expect(buildSocialPostView(post({ platform: 'generic' })).title).toBe('Social Media-Post');
  });

  it('takes the character budget from the shared platform table', () => {
    const view = buildSocialPostView(post({ platform: 'twitter' }));

    expect(view.maxChars).toBe(SOCIAL_PLATFORM_INFO.twitter.maxChars);
  });

  it('flags a post over the platform limit', () => {
    const view = buildSocialPostView(post({ platform: 'twitter', charCount: 281 }));

    expect(view.overLimit).toBe(true);
  });

  it('treats exactly the limit as still inside it', () => {
    const view = buildSocialPostView(post({ platform: 'twitter', charCount: 280 }));

    expect(view.overLimit).toBe(false);
  });

  it('hides the version until a chat edit has bumped it', () => {
    expect(buildSocialPostView(post({ version: 1 })).version).toBeNull();
    expect(buildSocialPostView(post({ version: 2 })).version).toBe(2);
  });

  it('collapses only past the threshold', () => {
    const short = 'x'.repeat(COLLAPSE_THRESHOLD);
    const long = 'x'.repeat(COLLAPSE_THRESHOLD + 1);

    expect(buildSocialPostView(post({ text: short })).isCollapsible).toBe(false);
    expect(buildSocialPostView(post({ text: long })).isCollapsible).toBe(true);
  });
});
