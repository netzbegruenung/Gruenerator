import { describe, expect, it, vi } from 'vitest';

import { withAutoRoles } from '../projectContext.js';
import { type StoredClipAnalysis } from '../projectTypes.js';

vi.mock('../../sharedMediaService.js', () => ({ getSharedMediaService: vi.fn() }));
const { completeBrief } = await import('../../../routes/videoAi/videoAiContractRouter.js');

function clip(clipId: string, words: number): StoredClipAnalysis {
  return {
    clipId,
    role: 'footage',
    proxyMediaId: 'p',
    proxyShareToken: 't',
    duration: 10,
    width: null,
    height: null,
    words: Array.from({ length: words }, (_, i) => ({ word: 'wort', start: i, end: i + 0.5 })),
    detectors: {
      silences: [],
      sceneCuts: [],
      quality: [],
      loudness: { integratedLufs: null, lra: null },
    },
    cells: [],
  };
}

describe('withAutoRoles', () => {
  it('turns quiet clips into b-roll while another clip speaks', () => {
    const result = withAutoRoles({ clips: [clip('c1', 40), clip('c2', 2)], assets: [] });
    expect(result.clips.map((c) => c.role)).toEqual(['footage', 'broll']);
  });

  it('leaves a lone quiet clip alone', () => {
    const analysis = { clips: [clip('c1', 3)], assets: [] };
    expect(withAutoRoles(analysis)).toBe(analysis);
  });
});

describe('completeBrief', () => {
  it('needs nothing but the files', () => {
    const brief = completeBrief(null, [
      { id: 'c1', mediaId: 'm', role: 'footage', title: 'IMG_0042.MOV' },
    ]);
    expect(brief).toEqual({ title: 'IMG_0042', format: '9:16', style: 'talking-head-dynamisch' });
  });
});
