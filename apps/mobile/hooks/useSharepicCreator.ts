import {
  SHAREPIC_PROMPT_MAX,
  type SharepicPhotoAttribution,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { type CreatorTweakWire } from '@gruenerator/shared';
import { getContractsClient } from '@gruenerator/shared/api';
import { sharepicRevisionReply, sharepicSourceNote } from '@gruenerator/shared/image-studio';
import { useCallback, useRef, useState } from 'react';

import {
  CreatorUnsupportedError,
  renderCreator,
  type CreatorRenderResult,
} from '../services/sharepicRender';

/** Review rounds per turn. Two catch most problems; more mostly churns. */
const MAX_REVIEWS = 2;

const RENDER_FAILED = 'Das Sharepic konnte nicht dargestellt werden. Versuch es bitte noch einmal.';
const TWEAK_FAILED = 'Die Gestaltung konnte nicht umgestellt werden. Versuch es bitte noch einmal.';
const UPDATE_NEEDED =
  'Diese Funktion braucht eine neuere Version des Grünerators. Versuch es später noch einmal.';

export interface CreatorMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  error: boolean;
}

export type CreatorPhase = 'idle' | 'drafting' | 'checking' | 'ready';

export interface CreatorDesign {
  /** Every slide as the web renderer drew it, in order. */
  images: string[];
}

const sameSpec = (a: SharepicSpec, b: SharepicSpec): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The free-text creator as a conversation, for the app: the first message
 * drafts, every later one revises the current draft. The app cannot compose or
 * render a sharepic itself, so every turn — review patch, design choices,
 * slides, contact sheet — is drawn by the web page behind the render bridge.
 * Mirrors the web hook without own photos and without session persistence.
 */
export function useSharepicCreator() {
  const [messages, setMessages] = useState<CreatorMessage[]>([]);
  const [phase, setPhase] = useState<CreatorPhase>('idle');
  const [design, setDesign] = useState<CreatorDesign | null>(null);
  const [tweaks, setTweaks] = useState<CreatorTweakWire[]>([]);
  // The draft as the AI left it; the person's design choices apply to it, never to each other.
  const [base, setBase] = useState<SharepicSpec | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  // The choices behind the sharepic on screen; `choice` runs ahead of it while a switch renders.
  const shownChoice = useRef<Record<string, string>>({});
  // The same, for render: minting a canvas reads it.
  const [shown, setShown] = useState<Record<string, string>>({});
  // `base` with the choices: what the next revision changes and what the editor opens.
  const [spec, setSpec] = useState<SharepicSpec | null>(null);
  const current = useRef<SharepicSpec | null>(null);
  const [attributions, setAttributions] = useState<(SharepicPhotoAttribution | null)[]>([]);
  // A later switch outruns an earlier render: only the newest one is shown.
  const tweakRun = useRef(0);
  const brief = useRef('');
  const nextId = useRef(0);

  const say = useCallback((role: CreatorMessage['role'], text: string, error = false) => {
    const id = nextId.current++;
    setMessages((prev) => [...prev, { id, role, text, error }]);
  }, []);

  const show = useCallback((result: CreatorRenderResult) => {
    current.current = result.spec;
    setSpec(result.spec);
    setDesign({ images: result.images });
    setTweaks(result.tweaks);
  }, []);

  const send = useCallback(
    async (typed: string) => {
      const text = typed.trim();
      if (!text) return;
      say('user', text);
      if (text.length > SHAREPIC_PROMPT_MAX) {
        say(
          'assistant',
          `Der Text ist zu lang – höchstens ${SHAREPIC_PROMPT_MAX.toLocaleString('de-DE')} Zeichen. Kürz ihn auf das, was aufs Sharepic soll.`,
          true
        );
        return;
      }
      const prior = current.current;
      setPhase('drafting');
      const client = getContractsClient().sharepicCreator;
      const draft = await client
        .draft({ body: { prompt: text, ...(prior ? { current: prior } : {}) } })
        .catch(() => null);
      if (draft?.status !== 200) {
        say(
          'assistant',
          draft?.status === 502
            ? draft.body.error
            : 'Das hat nicht geklappt. Versuch es bitte noch einmal.',
          true
        );
        setPhase(prior ? 'ready' : 'idle');
        return;
      }

      // Kept only with the spec they belong to: a failed render leaves the session as it was.
      const credits = draft.body.attributions;
      const nextBrief = prior ? `${brief.current}\nÄnderung: ${text}` : text;

      setPhase('checking');
      let result: CreatorRenderResult;
      try {
        result = await renderCreator({
          base: draft.body.spec,
          attributions: credits,
          patch: null,
          choice: {},
          sheet: true,
        });
        for (let round = 0; result.sheet && round < MAX_REVIEWS; round++) {
          const review = await client
            .review({ body: { spec: result.base, prompt: nextBrief, image: result.sheet } })
            .catch(() => null);
          if (review?.status !== 200 || review.body.ok) break;
          const patched = await renderCreator({
            base: result.base,
            attributions: credits,
            patch: review.body.patch,
            choice: {},
            sheet: round < MAX_REVIEWS - 1,
          });
          if (sameSpec(patched.base, result.base)) break;
          result = patched;
        }
      } catch (error) {
        say(
          'assistant',
          error instanceof CreatorUnsupportedError ? UPDATE_NEEDED : RENDER_FAILED,
          true
        );
        setPhase(prior ? 'ready' : 'idle');
        return;
      }

      setBase(result.base);
      setChoice({});
      shownChoice.current = {};
      setShown({});
      tweakRun.current++;
      setAttributions(credits);
      brief.current = nextBrief;
      show(result);
      const what =
        result.images.length > 1
          ? `Hier ist dein Karussell mit ${result.images.length} Slides.`
          : 'Hier ist dein Entwurf.';
      const source = sharepicSourceNote(result.base.slides, credits);
      const notice = draft.body.hinweis ? ` ${draft.body.hinweis}` : '';
      say(
        'assistant',
        prior
          ? sharepicRevisionReply({
              before: prior,
              after: result.spec,
              order: text,
              hinweis: draft.body.hinweis ?? null,
              attributions: credits,
            })
          : `${what}${notice} ${source} Schreib mir, was anders sein soll – oder öffne es im Editor.`
      );
      setPhase('ready');
    },
    [say, show]
  );

  /**
   * Shows the draft with these design choices: rendered again by the page,
   * without the model and without a review.
   */
  const showChoice = useCallback(
    async (next: Record<string, string>) => {
      if (!base || phase !== 'ready') return;
      const run = ++tweakRun.current;
      setChoice(next);
      const result = await renderCreator({
        base,
        attributions,
        patch: null,
        choice: next,
        sheet: false,
      }).catch(() => null);
      if (run !== tweakRun.current) return;
      if (!result) {
        setChoice(shownChoice.current);
        say('assistant', TWEAK_FAILED, true);
        return;
      }
      shownChoice.current = next;
      setShown(next);
      show(result);
    },
    [base, phase, attributions, show, say]
  );
  const tweak = useCallback(
    (id: string, value: string) => showChoice({ ...choice, [id]: value }),
    [showChoice, choice]
  );
  const reset = useCallback(() => showChoice({}), [showChoice]);

  return {
    messages,
    phase,
    design,
    send,
    tweaks,
    tweak,
    reset,
    tweaked: Object.keys(choice).length > 0,
    /** The sharepic on screen, for "Im Editor öffnen". */
    spec,
    /** The untweaked draft and the choices behind `spec`, so a minted canvas keeps them revertible. */
    base,
    shownChoice: shown,
    attributions,
  };
}
