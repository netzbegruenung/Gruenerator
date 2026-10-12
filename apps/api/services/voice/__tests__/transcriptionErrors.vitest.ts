import { describe, expect, it } from 'vitest';

import { describeTranscriptionFailure } from '../transcriptionErrors.js';

describe('describeTranscriptionFailure', () => {
  it('names a missing audio track instead of forwarding the ffmpeg line', () => {
    const ffmpeg = new Error(
      'ffmpeg exited with code 234: Output file #0 does not contain any stream'
    );
    expect(describeTranscriptionFailure('extraction', ffmpeg)).toContain('keine Tonspur');
  });

  it('never leaks the raw provider error', () => {
    const provider = new Error('Mistral API error 500: {"detail":"upstream timeout"}');
    const message = describeTranscriptionFailure('transcription', provider);
    expect(message).not.toContain('Mistral');
    expect(message).toContain('erneut');
  });

  it('separates a broken video from a missing audio track', () => {
    const corrupt = new Error('ffmpeg exited with code 1: moov atom not found');
    expect(describeTranscriptionFailure('extraction', corrupt)).toContain('beschädigt');
  });
});
