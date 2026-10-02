import {
  applySharepicPatch,
  composeSharepic,
  ensureFontsReady,
  type ComposedSharepic,
} from '@gruenerator/canvas-editor/composer';
import { type SharepicPhotoAttribution, type SharepicSpec } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useCallback, useRef, useState } from 'react';

import { renderSharepicToImage } from '../renderSharepicToImage';

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
  /** The design as the canvas editor renders it. */
  preview: string;
}

const photoSrc = (filename: string) =>
  `/api/image-picker/stock-image/${encodeURIComponent(filename)}`;

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
  const attribution = useRef<SharepicPhotoAttribution | null>(null);
  const brief = useRef('');
  const nextId = useRef(0);

  const say = useCallback((role: CreatorMessage['role'], text: string, error = false) => {
    const id = nextId.current++;
    setMessages((prev) => [...prev, { id, role, text, error }]);
  }, []);

  const send = useCallback(
    async (text: string) => {
      say('user', text);
      setPhase('drafting');
      const client = getContractsClient().sharepicCreator;
      const current = spec.current;
      const draft = await client
        .draft({ body: { prompt: text, ...(current ? { current } : {}) } })
        .catch(() => null);
      if (draft?.status !== 200) {
        say(
          'assistant',
          draft?.status === 502
            ? draft.body.error
            : 'Das hat nicht geklappt. Versuch es bitte noch einmal.',
          true
        );
        setPhase(current ? 'ready' : 'idle');
        return;
      }

      brief.current = current ? `${brief.current}\nÄnderung: ${text}` : text;
      attribution.current = draft.body.attribution;
      let next = draft.body.spec;

      setPhase('checking');
      await ensureFontsReady();
      const render = (c: ComposedSharepic) =>
        renderSharepicToImage(c.templateType, c.props, { quality: 'preview' });
      let composed = composeSharepic(next, { photoSrc, attribution: attribution.current });
      let image = await render(composed);
      for (let round = 0; image && round < MAX_REVIEWS; round++) {
        const review = await client
          .review({ body: { spec: next, prompt: brief.current, image } })
          .catch(() => null);
        if (review?.status !== 200 || review.body.ok) break;
        const patched = applySharepicPatch(next, review.body.patch).spec;
        if (patched === next) break;
        next = patched;
        composed = composeSharepic(next, { photoSrc, attribution: attribution.current });
        image = await render(composed);
      }
      if (!image) {
        say(
          'assistant',
          'Das Sharepic konnte nicht dargestellt werden. Versuch es bitte noch einmal.',
          true
        );
        setPhase(current ? 'ready' : 'idle');
        return;
      }

      spec.current = next;
      setDesign({ composed, preview: image });
      say(
        'assistant',
        (current ? 'Erledigt.' : 'Hier ist dein Entwurf.') +
          (current ? '' : ' Schreib mir, was anders sein soll – oder öffne ihn im Editor.')
      );
      setPhase('ready');
    },
    [say]
  );

  return { messages, phase, design, send };
}

/** Mints the design as a freeform canvas and returns its id. */
export async function mintCreatorCanvas(
  templateType: ComposedSharepic['templateType'],
  state: Record<string, unknown>,
  title: string
): Promise<string> {
  const response = await getContractsClient().canvas.create({
    body: {
      title,
      template_type: templateType,
      initial_state: state,
      format: 'post-portrait',
      page_count: 1,
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
