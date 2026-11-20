import { MAX_AUDIO_BYTES, MAX_VIDEO_UPLOAD_BYTES } from '@gruenerator/contracts';
import { useMediaUpload, type ResumableUpload } from '@gruenerator/shared/media-library';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

/** A File whose size is claimed, not allocated. */
function fakeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function setup(resumableUpload?: ResumableUpload) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useMediaUpload(resumableUpload ? { resumableUpload } : {}), { wrapper });
}

const resumable = vi.fn<ResumableUpload>(async () => ({
  id: 'm1',
  shareToken: 't',
  shareUrl: '/share/t',
  mediaType: 'video',
  createdAt: '2026-11-20T00:00:00.000Z',
}));

describe('useMediaUpload with a resumable uploader', () => {
  it('sends a 200 MB video through it, not through the 50 MB multipart route', async () => {
    const { result } = setup(resumable);
    const file = fakeFile('lang.mp4', 'video/mp4', 200 * 1024 * 1024);
    expect(result.current.validateFile(file)).toEqual({ valid: true });
    await act(async () => {
      await result.current.upload(file, { title: 'Lang' });
    });
    expect(resumable).toHaveBeenCalledTimes(1);
    expect(resumable.mock.calls[0]?.[1]).toMatchObject({ title: 'Lang' });
  });

  it('takes audio, and applies the audio ceiling to it', () => {
    const { result } = setup(resumable);
    expect(result.current.validateFile(fakeFile('a.mp3', 'audio/mpeg', 100 * 1024 * 1024))).toEqual(
      { valid: true }
    );
    expect(
      result.current.validateFile(fakeFile('a.mp3', 'audio/mpeg', MAX_AUDIO_BYTES + 1)).valid
    ).toBe(false);
  });

  it('refuses a video over the video ceiling and names it in GB', () => {
    const { result } = setup(resumable);
    const verdict = result.current.validateFile(
      fakeFile('riesig.mp4', 'video/mp4', MAX_VIDEO_UPLOAD_BYTES + 1)
    );
    expect(verdict).toEqual({ valid: false, error: 'Datei ist zu groß. Maximum: 3 GB' });
  });

  it('keeps images at 50 MB', () => {
    const { result } = setup(resumable);
    expect(
      result.current.validateFile(fakeFile('foto.png', 'image/png', 51 * 1024 * 1024)).valid
    ).toBe(false);
  });
});

describe('useMediaUpload without one (mobile)', () => {
  it('keeps the 50 MB limit for video and refuses audio', () => {
    const { result } = setup();
    expect(
      result.current.validateFile(fakeFile('v.mp4', 'video/mp4', 60 * 1024 * 1024)).valid
    ).toBe(false);
    expect(result.current.validateFile(fakeFile('a.mp3', 'audio/mpeg', 1024)).valid).toBe(false);
  });
});
