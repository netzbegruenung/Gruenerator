import { describe, expect, it } from 'vitest';

import { showsImageGenerationFrame } from './imageGenerationView';

import type { ChatMessageMetadata } from '@gruenerator/chat';

type Progress = ChatMessageMetadata['progress'];

function progress(overrides: Partial<NonNullable<Progress>> = {}): Progress {
  return { stage: 'generating_image', intent: 'image', ...overrides } as NonNullable<Progress>;
}

const base = { isStreaming: true, generatedImage: undefined, progress: progress() };

describe('showsImageGenerationFrame', () => {
  it('shows the frame while an image is being generated', () => {
    expect(showsImageGenerationFrame(base)).toBe(true);
  });

  it('shows it for an image edit too', () => {
    expect(
      showsImageGenerationFrame({ ...base, progress: progress({ intent: 'image_edit' }) })
    ).toBe(true);
  });

  // The check this component exists to get right: a sharepic run passes through
  // the same stage and draws its own card, so a frame here would be a second,
  // empty one above it.
  it('stays away from a sharepic run, which shares the stage', () => {
    expect(showsImageGenerationFrame({ ...base, progress: progress({ intent: 'sharepic' }) })).toBe(
      false
    );
  });

  it('stays away from a combined social post, for the same reason', () => {
    expect(
      showsImageGenerationFrame({ ...base, progress: progress({ intent: 'social_post' }) })
    ).toBe(false);
  });

  it('retires as soon as the picture itself arrives', () => {
    expect(
      showsImageGenerationFrame({
        ...base,
        generatedImage: { base64: 'x', style: 'illustration' } as NonNullable<
          ChatMessageMetadata['generatedImage']
        >,
      })
    ).toBe(false);
  });

  it('never appears on a finished turn', () => {
    expect(showsImageGenerationFrame({ ...base, isStreaming: false })).toBe(false);
  });

  it('ignores every other stage', () => {
    expect(showsImageGenerationFrame({ ...base, progress: progress({ stage: 'searching' }) })).toBe(
      false
    );
  });

  it('tolerates a turn that carries no progress at all', () => {
    expect(showsImageGenerationFrame({ ...base, progress: undefined })).toBe(false);
  });
});
