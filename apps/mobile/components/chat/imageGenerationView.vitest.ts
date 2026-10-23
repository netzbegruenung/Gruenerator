import { describe, expect, it } from 'vitest';

import { generationFrameFor } from './imageGenerationView';

import type { ChatMessageMetadata } from '@gruenerator/chat';

type Progress = ChatMessageMetadata['progress'];

function progress(overrides: Partial<NonNullable<Progress>> = {}): Progress {
  return { stage: 'generating_image', intent: 'image', ...overrides } as NonNullable<Progress>;
}

const base = {
  isStreaming: true,
  generatedImage: undefined,
  sharepicData: undefined,
  progress: progress(),
};

describe('generationFrameFor', () => {
  it('shows the frame while an image is being generated', () => {
    expect(generationFrameFor(base)).toBe('image');
  });

  it('shows it for an image edit too', () => {
    expect(generationFrameFor({ ...base, progress: progress({ intent: 'image_edit' }) })).toBe(
      'image'
    );
  });

  it('holds a sharepic frame while the sharepic is still being drafted', () => {
    expect(generationFrameFor({ ...base, progress: progress({ intent: 'sharepic' }) })).toBe(
      'sharepic'
    );
  });

  // The check this component exists to get right: once the sharepic's card is
  // there it shows the drawing itself, and a frame above it would be a second,
  // empty one.
  it('makes way for the sharepic card as soon as it arrives', () => {
    expect(
      generationFrameFor({
        ...base,
        progress: progress({ intent: 'sharepic' }),
        sharepicData: { variants: [] } as unknown as NonNullable<
          ChatMessageMetadata['sharepicData']
        >,
      })
    ).toBeNull();
  });

  it('stays away from a combined social post, which draws its own card', () => {
    expect(
      generationFrameFor({ ...base, progress: progress({ intent: 'social_post' }) })
    ).toBeNull();
  });

  it('retires as soon as the picture itself arrives', () => {
    expect(
      generationFrameFor({
        ...base,
        generatedImage: { base64: 'x', style: 'illustration' } as NonNullable<
          ChatMessageMetadata['generatedImage']
        >,
      })
    ).toBeNull();
  });

  it('never appears on a finished turn', () => {
    expect(generationFrameFor({ ...base, isStreaming: false })).toBeNull();
  });

  it('ignores every other stage', () => {
    expect(generationFrameFor({ ...base, progress: progress({ stage: 'searching' }) })).toBeNull();
  });

  it('tolerates a turn that carries no progress at all', () => {
    expect(generationFrameFor({ ...base, progress: undefined })).toBeNull();
  });
});
