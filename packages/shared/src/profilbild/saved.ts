import { type PersonPlacement } from './geometry.js';
import { PROFILBILD_STICKERS, type ProfilbildSticker } from './stickers.js';

/** `shared_media.image_type` of a saved Profilbild — already classified as a sharepic. */
export const PROFILBILD_IMAGE_TYPE = 'profilbild';

/** Editor key in `image_metadata` that carries the reopenable editor state. */
export const PROFILBILD_METADATA_KEY = 'profilbild';

export type SavedProfilbildBackground =
  /** A swatch or preset id; an id the viewer's locale lacks falls back to its first colour. */
  | { kind: 'id'; id: string }
  /** The person's own photo, uploaded to the media store; a `/api/share/<token>/download` path. */
  | { kind: 'custom'; url: string };

export interface SavedProfilbildSticker {
  id: ProfilbildSticker['id'];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/**
 * Everything needed to reopen a Profilbild, on the 1080 sheet. The cutout itself
 * travels as the share's original image, so the placement matches its aspect.
 */
export interface SavedProfilbild {
  v: 1;
  person: PersonPlacement;
  background: SavedProfilbildBackground;
  stickers: SavedProfilbildSticker[];
}

const STICKER_IDS = new Set<string>(PROFILBILD_STICKERS.map((s) => s.id));

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseBackground(raw: unknown): SavedProfilbildBackground | null {
  const bg = raw as { kind?: unknown; id?: unknown; url?: unknown } | null;
  if (bg?.kind === 'id' && typeof bg.id === 'string') return { kind: 'id', id: bg.id };
  if (bg?.kind === 'custom' && typeof bg.url === 'string' && bg.url.startsWith('/api/share/'))
    return { kind: 'custom', url: bg.url };
  return null;
}

function parseSticker(raw: unknown): SavedProfilbildSticker | null {
  const s = raw as Record<string, unknown> | null;
  if (!s || typeof s.id !== 'string' || !STICKER_IDS.has(s.id)) return null;
  const { x, y, width, height, rotation } = s;
  if (!isNum(x) || !isNum(y) || !isNum(width) || !isNum(height) || !isNum(rotation)) return null;
  return { id: s.id as ProfilbildSticker['id'], x, y, width, height, rotation };
}

/** Reads the editor state back out of a share's `image_metadata`; null when absent or foreign. */
export function parseSavedProfilbild(metadata: unknown): SavedProfilbild | null {
  const raw = (metadata as Record<string, unknown> | null)?.[PROFILBILD_METADATA_KEY] as
    Record<string, unknown> | null | undefined;
  if (raw?.v !== 1) return null;
  const person = raw.person as Record<string, unknown> | null;
  if (!person || !isNum(person.x) || !isNum(person.y) || !isNum(person.scale)) return null;
  const background = parseBackground(raw.background);
  if (!background) return null;
  const stickers = Array.isArray(raw.stickers)
    ? raw.stickers.map(parseSticker).filter((s) => s !== null)
    : [];
  return {
    v: 1,
    person: { x: person.x, y: person.y, scale: person.scale },
    background,
    stickers,
  };
}

export function stickerById(id: string): ProfilbildSticker | null {
  return PROFILBILD_STICKERS.find((s) => s.id === id) ?? null;
}

export function stickerBySrc(src: string): ProfilbildSticker | null {
  return PROFILBILD_STICKERS.find((s) => s.src === src) ?? null;
}

/**
 * Shares that reopen in the Profilbild editor instead of the lightbox. The image
 * type alone is not enough: canvas exports of the profilbild template share it.
 */
export function isProfilbildShare(share: {
  imageType?: string | null;
  imageMetadata?: unknown;
}): boolean {
  return (
    share.imageType === PROFILBILD_IMAGE_TYPE && parseSavedProfilbild(share.imageMetadata) !== null
  );
}
