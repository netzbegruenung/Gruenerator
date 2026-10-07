import {
  applySharepicPatch,
  applySharepicTweaks,
  type ComposedSharepic,
  sharepicTweaks,
  type SharepicTweakChoice,
  type SharepicTweakId,
} from '@gruenerator/canvas-editor/composer';
import {
  isSharepicUploadId,
  SHAREPIC_PROMPT_MAX,
  type SharepicPhotoAttribution,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { renderSharepicToImage } from '../renderSharepicToImage';

import { composeCreatorSharepic, canvasSeed, creatorPhotoSrc } from './composeForRender';
import { loadCreatorSession, saveCreatorSession } from './creatorSession';
import { forgetUploadTones, loadImage } from './photoTone';
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

/** One of the user's photos in this session, under the id the draft uses for it. */
interface OwnPhoto extends CreatorPhoto {
  id: string;
}

const photoSource = (photos: readonly OwnPhoto[]) => (filename: string) =>
  isSharepicUploadId(filename)
    ? (photos.find((p) => p.id === filename)?.url ?? '')
    : creatorPhotoSrc(filename);

async function renderPreviews(c: ComposedSharepic): Promise<string[] | null> {
  const images = await Promise.all(
    c.slides.map((slide) =>
      renderSharepicToImage(c.templateType, slide, {
        quality: 'preview',
        formatId: c.format,
      })
    )
  );
  return images.every((image): image is string => !!image) ? images : null;
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
  // The slide's own aspect, 4:5 or 3:4.
  const height = Math.round((width * images[0]!.naturalHeight) / images[0]!.naturalWidth);
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
export function useSharepicCreator(userId: string | null) {
  const [messages, setMessages] = useState<CreatorMessage[]>([]);
  const [phase, setPhase] = useState<CreatorPhase>('idle');
  const [design, setDesign] = useState<CreatorDesign | null>(null);
  const spec = useRef<SharepicSpec | null>(null);
  // The draft as the AI left it; the person's design choices apply to it, never to each other.
  const [base, setBase] = useState<SharepicSpec | null>(null);
  const [choice, setChoice] = useState<SharepicTweakChoice>({});
  // The choices behind the spec on screen; `choice` runs ahead of it while a switch renders.
  const shownChoice = useRef<SharepicTweakChoice>({});
  // A later switch outruns an earlier render: only the newest one is shown.
  const tweakRun = useRef(0);
  const attributions = useRef<(SharepicPhotoAttribution | null)[]>([]);
  const brief = useRef('');
  const nextId = useRef(0);
  // The session's own photos: a revision may keep using one from an earlier turn.
  const ownPhotos = useRef<OwnPhoto[]>([]);
  const unsent = useRef<CreatorPhoto[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  // A restore that failed to render says so once; saving it would repeat it on every reload.
  const restoreError = useRef<number | null>(null);

  // Upload ids restart at upload:1 in a new session — their measured tones must not outlive this one.
  useEffect(() => forgetUploadTones, []);

  // Only finished turns are kept: a reload mid-draft comes back to the last answer.
  useEffect(() => {
    const kept = messages.filter((m) => m.id !== restoreError.current);
    if (!userId || !kept.length || phase === 'drafting' || phase === 'checking') return;
    saveCreatorSession({
      userId,
      messages: kept,
      spec: spec.current,
      base,
      choice: shownChoice.current,
      attributions: attributions.current,
      brief: brief.current,
      photos: ownPhotos.current,
    });
  }, [userId, messages, phase, base]);

  const say = useCallback((role: CreatorMessage['role'], text: string, error = false) => {
    const id = nextId.current++;
    setMessages((prev) => [...prev, { id, role, text, error }]);
    return id;
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
      if (text.length > SHAREPIC_PROMPT_MAX) {
        say(
          'assistant',
          `Der Text ist zu lang – höchstens ${SHAREPIC_PROMPT_MAX.toLocaleString('de-DE')} Zeichen. Kürz ihn auf das, was aufs Sharepic soll.`,
          true
        );
        unsent.current = added;
        return;
      }
      // Numbered now, kept for the session only once the draft has worked.
      const photos: OwnPhoto[] = [
        ...ownPhotos.current,
        ...added.map((p, i) => ({ ...p, id: `upload:${ownPhotos.current.length + i + 1}` })),
      ];
      const photoSrc = photoSource(photos);
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

      // Kept only with the spec they belong to: a failed render leaves the session as it was.
      const credits = draft.body.attributions;
      const nextBrief = current ? `${brief.current}\nÄnderung: ${text}` : text;
      let next = draft.body.spec;

      setPhase('checking');
      let composed = await composeCreatorSharepic(next, credits, photoSrc);
      let previews = await renderPreviews(composed);
      for (let round = 0; previews && round < MAX_REVIEWS; round++) {
        const image = await contactSheet(previews).catch(() => null);
        if (!image) break;
        const review = await client
          .review({ body: { spec: next, prompt: nextBrief, image } })
          .catch(() => null);
        if (review?.status !== 200 || review.body.ok) break;
        const patched = applySharepicPatch(next, review.body.patch).spec;
        if (patched === next) break;
        next = patched;
        composed = await composeCreatorSharepic(next, credits, photoSrc);
        previews = await renderPreviews(composed);
      }
      if (!previews) {
        say(
          'assistant',
          'Das Sharepic konnte nicht dargestellt werden. Versuch es bitte noch einmal.',
          true
        );
        unsent.current = added;
        setPhase(current ? 'ready' : 'idle');
        return;
      }

      spec.current = next;
      setBase(next);
      setChoice({});
      shownChoice.current = {};
      tweakRun.current++;
      attributions.current = credits;
      brief.current = nextBrief;
      ownPhotos.current = photos;
      unsent.current = [];
      setPhotoCount(photos.length);
      setDesign({ composed, previews });
      const what =
        composed.slides.length > 1
          ? `Hier ist dein Karussell mit ${composed.slides.length} Slides.`
          : 'Hier ist dein Entwurf.';
      const source = sharepicSourceNote(next.slides, credits);
      const notice = draft.body.hinweis ? ` ${draft.body.hinweis}` : '';
      // A wish the spec cannot express comes back as the same draft — "Erledigt" would be false.
      const unchanged = current !== null && JSON.stringify(next) === JSON.stringify(current);
      say(
        'assistant',
        unchanged
          ? 'Am Entwurf hat sich dabei nichts geändert. Wenn du etwas anderes gemeint hast, beschreib es genauer – oder öffne das Sharepic im Editor und ändere es dort direkt.'
          : current
            ? `Erledigt.${notice} ${source}`
            : `${what}${notice} ${source} Schreib mir, was anders sein soll – oder öffne es im Editor.`
      );
      setPhase('ready');
    },
    [say]
  );

  const reportPhotoError = useCallback(
    (text: string) => {
      say('assistant', text, true);
    },
    [say]
  );

  /** Brings back this account's last session; false when there is none. */
  const resume = useCallback((): boolean => {
    const session = userId ? loadCreatorSession(userId) : null;
    if (!session) return false;
    spec.current = session.spec;
    setBase(session.base ?? session.spec);
    shownChoice.current = session.choice ?? {};
    setChoice(shownChoice.current);
    attributions.current = session.attributions;
    brief.current = session.brief;
    ownPhotos.current = session.photos;
    nextId.current = Math.max(...session.messages.map((m) => m.id)) + 1;
    setPhotoCount(session.photos.length);
    setMessages(session.messages);
    const restored = session.spec;
    if (!restored) return true;
    setPhase('checking');
    void (async () => {
      const photoSrc = photoSource(session.photos);
      const composed = await composeCreatorSharepic(restored, session.attributions, photoSrc);
      const previews = await renderPreviews(composed);
      return previews && { composed, previews };
    })()
      .catch(() => null)
      .then((restoredDesign) => {
        if (restoredDesign) setDesign(restoredDesign);
        else
          restoreError.current = say(
            'assistant',
            'Das Sharepic konnte nicht dargestellt werden.',
            true
          );
        setPhase('ready');
      });
    return true;
  }, [userId, say]);

  const tweaks = useMemo(() => (base ? sharepicTweaks(base, choice) : []), [base, choice]);

  /**
   * Shows the draft with these design choices: applied locally and rendered
   * again, without the model and without a review.
   */
  const showChoice = useCallback(
    async (nextChoice: SharepicTweakChoice) => {
      if (!base || phase === 'drafting' || phase === 'checking') return;
      const next = applySharepicTweaks(base, nextChoice);
      const run = ++tweakRun.current;
      setChoice(nextChoice);
      const composed = await composeCreatorSharepic(
        next,
        attributions.current,
        photoSource(ownPhotos.current)
      );
      const previews = await renderPreviews(composed);
      if (run !== tweakRun.current || !previews) return;
      spec.current = next;
      shownChoice.current = nextChoice;
      setDesign({ composed, previews });
      // Kept like a turn: a reload comes back to the variation on screen.
      if (userId)
        saveCreatorSession({
          userId,
          messages: messages.filter((m) => m.id !== restoreError.current),
          spec: next,
          base,
          choice: nextChoice,
          attributions: attributions.current,
          brief: brief.current,
          photos: ownPhotos.current,
        });
    },
    [base, phase, userId, messages]
  );
  const tweak = useCallback(
    (id: SharepicTweakId, value: string) => showChoice({ ...choice, [id]: value }),
    [showChoice, choice]
  );
  const resetTweaks = useCallback(() => showChoice({}), [showChoice]);

  return {
    messages,
    phase,
    design,
    send,
    resume,
    reportPhotoError,
    photoCount,
    tweaks,
    tweak,
    resetTweaks,
    tweaked: Object.keys(choice).length > 0,
  };
}

/**
 * Mints the design as a freeform canvas — one page per slide — and returns
 * its id. The server seeds the pages from `initial_state.pages`.
 */
export async function mintCreatorCanvas(
  composed: ComposedSharepic,
  title: string
): Promise<string> {
  const seed = canvasSeed(composed);
  const response = await getContractsClient().canvas.create({
    body: {
      title,
      template_type: seed.templateType,
      initial_state: seed.initialState,
      format: seed.format,
      page_count: seed.pageCount,
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
