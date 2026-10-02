import {
  applySharepicPatch,
  composeSharepic,
  ensureFontsReady,
  type ComposedSharepic,
} from '@gruenerator/canvas-editor/composer';
import {
  isSharepicUploadId,
  type SharepicPhotoAttribution,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useCallback, useEffect, useRef, useState } from 'react';

import { renderSharepicToImage } from '../renderSharepicToImage';

import { cachedPhotoTone, forgetUploadTones, loadImage, primePhotoTones } from './photoTone';
import { type CreatorPhoto, MAX_PHOTOS, PHOTO_ONLY_PROMPT } from './sharepicPhotos';
import { sharepicSourceNote } from './sharepicSourceNote';

/** Review rounds per turn. Two catch most problems; more mostly churns. */
const MAX_REVIEWS = 2;

export interface CreatorMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
}

export type CreatorPhase = 'idle' | 'drafting' | 'checking' | 'ready';

export interface CreatorDesign {
  composed: ComposedSharepic;
  /** Every slide as the canvas editor renders it, in order. */
  previews: string[];
}

const stockPhotoSrc = (filename: string) =>
  `/api/image-picker/stock-image/${encodeURIComponent(filename)}`;

/** One of the user's photos in this session, under the id the draft uses for it. */
interface OwnPhoto extends CreatorPhoto {
  id: string;
}

/**
 * The review sees a carousel at once: slides in swipe order on a grid, each
 * numbered as the patch addresses it.
 */
async function contactSheet(previews: string[]): Promise<string | null> {
  if (previews.length === 1) return previews[0] ?? null;
  const images = await Promise.all(previews.map(loadImage));
  const columns = Math.min(images.length, 4);
  const rows = Math.ceil(images.length / columns);
  const width = 432;
  const height = 540;
  const gap = 12;
  const canvas = document.createElement('canvas');
  canvas.width = columns * width + (columns - 1) * gap;
  canvas.height = rows * height + (rows - 1) * gap;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  images.forEach((image, i) => {
    const x = (i % columns) * (width + gap);
    const y = Math.floor(i / columns) * (height + gap);
    ctx.drawImage(image, x, y, width, height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, 44, 40);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(String(i), x + 14, y + 29);
  });
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * The free-text creator as a conversation: the first message drafts, every
 * later one revises the current draft. Each turn is composed and rendered here
 * (only the browser has the editor's own renderer), checked by the vision
 * review, patched, and shown in the editor.
 */
export function useSharepicCreator() {
  const [messages, setMessages] = useState<CreatorMessage[]>([]);
  const [phase, setPhase] = useState<CreatorPhase>('idle');
  const [design, setDesign] = useState<CreatorDesign | null>(null);
  const spec = useRef<SharepicSpec | null>(null);
  const attributions = useRef<(SharepicPhotoAttribution | null)[]>([]);
  const brief = useRef('');
  const nextId = useRef(0);
  // The session's own photos: a revision may keep using one from an earlier turn.
  const ownPhotos = useRef<OwnPhoto[]>([]);
  const unsent = useRef<CreatorPhoto[]>([]);
  const [photoCount, setPhotoCount] = useState(0);

  // Upload ids restart at upload:1 in a new session — their measured tones must not outlive this one.
  useEffect(() => forgetUploadTones, []);

  const say = useCallback((role: CreatorMessage['role'], text: string, error = false) => {
    const id = nextId.current++;
    setMessages((prev) => [...prev, { id, role, text, error }]);
  }, []);

  const send = useCallback(
    async (typed: string, newPhotos: readonly CreatorPhoto[] = []) => {
      // Photos of a draft that failed come along again; the same library file never counts twice.
      const known = new Set(ownPhotos.current.map((p) => p.url));
      const fresh = [...unsent.current, ...newPhotos].filter(
        (p) => !known.has(p.url) && (known.add(p.url), true)
      );
      const room = Math.max(MAX_PHOTOS - ownPhotos.current.length, 0);
      const added = fresh.slice(0, room);
      const t = typed.trim();
      // A photo carries the request alone or next to a few words ("ok", "mach mal").
      const text =
        t.length >= 3 || !added.length ? t : t ? `${PHOTO_ONLY_PROMPT} ${t}` : PHOTO_ONLY_PROMPT;
      const names = added.map((p) => p.name).join(', ');
      say('user', added.length ? `${text}\nFotos: ${names}` : text);
      if (added.length < fresh.length) {
        say(
          'assistant',
          `Mehr als ${MAX_PHOTOS} eigene Fotos gehen nicht – die übrigen fehlen.`,
          true
        );
      }
      // Numbered now, kept for the session only once the draft has worked.
      const photos: OwnPhoto[] = [
        ...ownPhotos.current,
        ...added.map((p, i) => ({ ...p, id: `upload:${ownPhotos.current.length + i + 1}` })),
      ];
      const photoSrc = (filename: string) =>
        isSharepicUploadId(filename)
          ? (photos.find((p) => p.id === filename)?.url ?? '')
          : stockPhotoSrc(filename);
      setPhase('drafting');
      const client = getContractsClient().sharepicCreator;
      const current = spec.current;
      const draft = await client
        .draft({
          body: {
            prompt: text,
            ...(current ? { current } : {}),
            ...(photos.length
              ? { photos: photos.map(({ id, analysis }) => ({ id, analysis })) }
              : {}),
          },
        })
        .catch(() => null);
      if (draft?.status !== 200) {
        say(
          'assistant',
          draft?.status === 502
            ? draft.body.error
            : 'Das hat nicht geklappt. Versuch es bitte noch einmal.',
          true
        );
        unsent.current = added;
        setPhase(current ? 'ready' : 'idle');
        return;
      }

      ownPhotos.current = photos;
      unsent.current = [];
      setPhotoCount(photos.length);
      brief.current = current ? `${brief.current}\nÄnderung: ${text}` : text;
      attributions.current = draft.body.attributions;
      let next = draft.body.spec;

      setPhase('checking');
      await ensureFontsReady();
      // Photo brightness decides how dense the scrim gets; a failed measure is no tone.
      await primePhotoTones(next, photoSrc);
      const compose = (spec: SharepicSpec) =>
        composeSharepic(spec, {
          photoSrc,
          attributions: attributions.current,
          photoTone: cachedPhotoTone,
        });
      const render = async (c: ComposedSharepic) => {
        const images = await Promise.all(
          c.slides.map((slide) =>
            renderSharepicToImage(c.templateType, slide, { quality: 'preview' })
          )
        );
        return images.every((image): image is string => !!image) ? images : null;
      };
      let composed = compose(next);
      let previews = await render(composed);
      for (let round = 0; previews && round < MAX_REVIEWS; round++) {
        const image = await contactSheet(previews).catch(() => null);
        if (!image) break;
        const review = await client
          .review({ body: { spec: next, prompt: brief.current, image } })
          .catch(() => null);
        if (review?.status !== 200 || review.body.ok) break;
        const patched = applySharepicPatch(next, review.body.patch).spec;
        if (patched === next) break;
        next = patched;
        await primePhotoTones(next, photoSrc);
        composed = compose(next);
        previews = await render(composed);
      }
      if (!previews) {
        say(
          'assistant',
          'Das Sharepic konnte nicht dargestellt werden. Versuch es bitte noch einmal.',
          true
        );
        setPhase(current ? 'ready' : 'idle');
        return;
      }

      spec.current = next;
      setDesign({ composed, previews });
      const what =
        composed.slides.length > 1
          ? `Hier ist dein Karussell mit ${composed.slides.length} Slides.`
          : 'Hier ist dein Entwurf.';
      const source = sharepicSourceNote(next.slides, attributions.current);
      say(
        'assistant',
        current
          ? `Erledigt. ${source}`
          : `${what} ${source} Schreib mir, was anders sein soll – oder öffne es im Editor.`
      );
      setPhase('ready');
    },
    [say]
  );

  const reportPhotoError = useCallback((text: string) => say('assistant', text, true), [say]);

  return { messages, phase, design, send, reportPhotoError, photoCount };
}

/**
 * Mints the design as a freeform canvas — one page per slide — and returns
 * its id. The server seeds the pages from `initial_state.pages`; the flat
 * cover keys beside them serve the gallery card, as for slider decks.
 */
export async function mintCreatorCanvas(
  composed: ComposedSharepic,
  title: string
): Promise<string> {
  const pages = composed.slides.map((state, i) => ({
    id: `seed-${i}`,
    configId: composed.templateType,
    state,
  }));
  const response = await getContractsClient().canvas.create({
    body: {
      title,
      template_type: composed.templateType,
      initial_state: { ...pages[0]!.state, pages },
      format: 'post-portrait',
      page_count: pages.length,
    },
  });
  if (response.status !== 201) {
    throw new ApiError(
      response.status,
      `Canvas konnte nicht erstellt werden (HTTP ${response.status}).`
    );
  }
  return response.body.id;
}
