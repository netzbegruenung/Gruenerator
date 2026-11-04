/**
 * Photos a sharepic turn brings along: direct image uploads and Wolke files.
 * Numbers them `upload:N` after the photos earlier turns already hold and
 * reports what it leaves out. Wolke sizes are unknown here — the download
 * step checks them.
 */

import {
  SHAREPIC_UPLOAD_MAX,
  type SharepicBerichtEintrag,
  type SharepicOwnPhoto,
  type WolkeFileRef,
} from '@gruenerator/contracts';

import { type ImageAttachment } from '../../../agents/langgraph/ChatGraph/types.js';
import { MAX_BYTES } from '../../../services/sharepicCreator/photoAnalysis.js';

export type SharepicOwnPhotoWithUrl = SharepicOwnPhoto & { url: string };

export type TurnPhotoSource =
  | { kind: 'upload'; name: string; mimeType: string; data: string }
  | { kind: 'wolke'; ref: WolkeFileRef };

const WOLKE_IMAGE_EXT = /\.(?:jpe?g|png|webp)$/i;

const stripDataPrefix = (data: string): string => data.replace(/^data:[^,]*,/, '');
const base64Bytes = (b64: string): number => Math.floor((b64.length * 3) / 4);

const gestaltung = (text: string): SharepicBerichtEintrag => ({ art: 'gestaltung', text });

export function collectTurnPhotos(
  images: readonly ImageAttachment[],
  wolke: readonly WolkeFileRef[],
  prior: readonly SharepicOwnPhotoWithUrl[]
): { take: { id: string; source: TurnPhotoSource }[]; skipped: SharepicBerichtEintrag[] } {
  const used = new Set(prior.map((p) => p.id));
  const nextId = (): string | null => {
    for (let n = 1; n <= SHAREPIC_UPLOAD_MAX; n += 1) {
      if (!used.has(`upload:${n}`)) return `upload:${n}`;
    }
    return null;
  };

  const candidates: TurnPhotoSource[] = [
    ...images.map<TurnPhotoSource>((i) => ({
      kind: 'upload',
      name: i.name,
      mimeType: i.type,
      data: stripDataPrefix(i.data),
    })),
    ...wolke
      .filter((ref) => WOLKE_IMAGE_EXT.test(ref.name))
      .map<TurnPhotoSource>((ref) => ({ kind: 'wolke', ref })),
  ];

  const take: { id: string; source: TurnPhotoSource }[] = [];
  let tooLarge = 0;
  let overLimit = 0;
  for (const source of candidates) {
    if (source.kind === 'upload' && base64Bytes(source.data) > MAX_BYTES) {
      tooLarge += 1;
      continue;
    }
    const id = nextId();
    if (!id) {
      overLimit += 1;
      continue;
    }
    used.add(id);
    take.push({ id, source });
  }

  const skipped: SharepicBerichtEintrag[] = [];
  if (tooLarge > 0) {
    skipped.push(
      gestaltung(
        tooLarge === 1
          ? 'Ein Foto habe ich nicht verwendet – es war zu groß.'
          : `${tooLarge} Fotos habe ich nicht verwendet – sie waren zu groß.`
      )
    );
  }
  if (overLimit > 0) {
    skipped.push(
      gestaltung(
        overLimit === 1
          ? `Ein weiteres Foto habe ich nicht verwendet – höchstens ${SHAREPIC_UPLOAD_MAX} Fotos pro Sharepic.`
          : `${overLimit} weitere Fotos habe ich nicht verwendet – höchstens ${SHAREPIC_UPLOAD_MAX} Fotos pro Sharepic.`
      )
    );
  }
  return { take, skipped };
}
