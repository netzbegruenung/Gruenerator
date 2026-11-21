import { describe, expect, it } from 'vitest';

import { buildConcatFilter } from './concatVideos.js';

describe('buildConcatFilter', () => {
  it('scales every part into one frame and fills a silent part with silence', () => {
    const filter = buildConcatFilter(
      [
        { hasAudio: true, duration: 4 },
        { hasAudio: false, duration: 2.5 },
      ],
      1080,
      1920
    );
    expect(filter).toContain('[0:v]scale=1080:1920:force_original_aspect_ratio=decrease');
    expect(filter).toContain('[0:a]aresample=48000');
    expect(filter).toContain('anullsrc=r=48000:cl=stereo,atrim=duration=2.500[a1]');
    expect(filter).toMatch(/\[v0\]\[a0\]\[v1\]\[a1\]concat=n=2:v=1:a=1\[v\]\[a\]$/);
  });
});
