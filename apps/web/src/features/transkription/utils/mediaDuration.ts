/**
 * Read a media file's duration in the browser, before anything is uploaded.
 *
 * Without this the only place the limit is discovered is inside the provider
 * SDK — after a full upload and, for video, after audio extraction. On a large
 * recording that is several minutes of the user's time spent to reach an error.
 *
 * Resolves `null` when the duration cannot be determined (unsupported codec,
 * stream without metadata). Callers must treat that as "unknown, proceed"
 * rather than as a failure — guessing would block files that transcribe fine.
 */
export function readMediaDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
    el.preload = 'metadata';

    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      el.removeAttribute('src');
      resolve(value);
    };

    el.onloadedmetadata = () => {
      const { duration } = el;
      done(Number.isFinite(duration) && duration > 0 ? duration : null);
    };
    el.onerror = () => done(null);

    el.src = url;
  });
}
