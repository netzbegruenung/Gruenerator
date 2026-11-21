/**
 * A finished resumable upload (TUS, `/api/uploads`) becomes a Mediathek
 * item: videos too large for the 50 MB multipart path, and audio, which the
 * multipart path does not take at all. What the file is decides ffprobe, not
 * the name or the client's MIME claim — a file without a decodable video or
 * sound track is refused. Only the person who created the upload can import
 * it (the tus server stamps the uploader into the upload metadata); a foreign
 * or unknown id looks the same: not found.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { MAX_AUDIO_BYTES, MAX_VIDEO_UPLOAD_BYTES } from '@gruenerator/contracts';

export interface ProbedStream {
  codec_type: string;
  codec_name?: string;
}

export const IMPORT_REFUSED =
  'Die Datei ist kein lesbares Video (mp4, mov, webm) und kein Audio (mp3, m4a, wav, ogg, flac).';

export interface UploadKind {
  mediaType: 'video' | 'audio';
  mimeType: string;
  extension: string;
  durationSeconds: number;
}

const VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};
const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
};
/** An mp3 or m4a with cover art reports the picture as a video stream. */
const STILL_CODECS = new Set(['mjpeg', 'png', 'bmp', 'gif']);

export function classifyUpload(
  streams: readonly ProbedStream[],
  formatDuration: string | undefined,
  filename: string
): UploadKind | null {
  const extension = path.extname(filename).slice(1).toLowerCase();
  const durationSeconds = Number(formatDuration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const hasMoving = streams.some(
    (s) => s.codec_type === 'video' && !STILL_CODECS.has(s.codec_name ?? '')
  );
  const hasSound = streams.some((s) => s.codec_type === 'audio');

  if (hasMoving) {
    // An unknown container (mkv, avi) would be stored under a MIME type it is
    // not, and the Mediathek player could not play it.
    const known = VIDEO_TYPES[extension];
    return known ? { mediaType: 'video', mimeType: known, extension, durationSeconds } : null;
  }
  if (hasSound) {
    const known = AUDIO_TYPES[extension];
    if (!known) return null;
    return { mediaType: 'audio', mimeType: known, extension, durationSeconds };
  }
  return null;
}

export type ImportResult =
  | {
      ok: true;
      mediaId: string;
      mediaType: 'video' | 'audio';
      title: string;
      shareToken: string;
      durationSeconds: number;
    }
  | { ok: false; status: 400 | 404 | 409; error: string };

const NOT_FOUND: ImportResult = {
  ok: false,
  status: 404,
  error: 'Der Upload wurde nicht gefunden.',
};

/** Imports in flight in this process; the file move is the guard across workers. */
const importing = new Set<string>();

/** Takes a finished TUS upload into the person's Mediathek. */
export async function importUpload(
  userId: string,
  uploadId: string,
  title: string | null
): Promise<ImportResult> {
  if (importing.has(uploadId)) {
    return { ok: false, status: 409, error: 'Der Upload wird gerade übernommen.' };
  }
  importing.add(uploadId);
  try {
    return await importOwnUpload(userId, uploadId, title);
  } finally {
    importing.delete(uploadId);
  }
}

async function importOwnUpload(
  userId: string,
  uploadId: string,
  title: string | null
): Promise<ImportResult> {
  // Lazy: tusService starts its cleanup timers on import, which the pure
  // classifier above (and its tests) must not pull in.
  const tus = await import('../subtitler/tusService.js');
  const { ffprobe } = await import('../subtitler/ffmpegWrapper.js');
  const { getSharedMediaService } = await import('../sharedMediaService.js');

  const status = await tus.getUploadStatus(uploadId);
  // Unknown, foreign and pre-stamp uploads all answer 404: the answer must not
  // tell another person which upload ids exist.
  if (!status.exists || tus.getUploadOwner(status) !== userId) return NOT_FOUND;
  const sourcePath = tus.getFilePathFromUploadId(uploadId);
  // Complete = all announced bytes on disk. The sidecar's `offset` is no
  // help: @tus/server's FileStore never updates it (only the binary upload
  // path writes it), so `status.isComplete` is false for every TUS upload.
  const onDisk = await fs
    .stat(sourcePath)
    .then((s) => s.size)
    .catch(() => -1);
  const announced = status.metadata?.size ?? Number.POSITIVE_INFINITY;
  if (onDisk < announced) {
    return { ok: false, status: 409, error: 'Der Upload ist noch nicht vollständig.' };
  }
  const filename = await tus.getOriginalFilename(uploadId);
  let kind: UploadKind | null = null;
  try {
    const meta = await ffprobe(sourcePath);
    kind = classifyUpload(meta.streams, meta.format.duration, filename);
  } catch (error) {
    // ffprobe that cannot start (missing or not executable) is our fault, not
    // the file's: answering "not a video" would delete a good upload. Seen
    // locally on 18.11.2026 with a binary that had lost its executable bit.
    if (typeof (error as NodeJS.ErrnoException).code === 'string') throw error;
    kind = null;
  }
  if (!kind) {
    await tus.cleanupUploadFiles(uploadId, 'not importable');
    return { ok: false, status: 400, error: IMPORT_REFUSED };
  }

  // tus capped the upload by the filetype the client declared; what the file
  // really is decides here (audio stays under the audio cap, as in tusService).
  const cap = kind.mediaType === 'video' ? MAX_VIDEO_UPLOAD_BYTES : MAX_AUDIO_BYTES;
  if (onDisk > cap) {
    await tus.cleanupUploadFiles(uploadId, 'too large');
    return { ok: false, status: 400, error: IMPORT_REFUSED };
  }

  const name = title?.trim() || path.basename(filename, path.extname(filename)) || 'Upload';
  const share = await getSharedMediaService().importUploadedMedia(userId, {
    sourcePath,
    mediaType: kind.mediaType,
    mimeType: kind.mimeType,
    extension: kind.extension,
    title: name,
    originalFilename: filename,
    durationSeconds: kind.durationSeconds,
  });
  tus.markUploadAsPromoted(uploadId);
  await tus.cleanupUploadFiles(uploadId, 'imported to Mediathek');
  return {
    ok: true,
    mediaId: share.id,
    shareToken: share.shareToken,
    mediaType: kind.mediaType,
    title: name,
    durationSeconds: kind.durationSeconds,
  };
}
