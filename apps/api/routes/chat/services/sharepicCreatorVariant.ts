/**
 * The chat's sharepic: one variant drafted by the freitext creator. The server
 * only carries the spec; every renderer composes it in the browser.
 */
import { randomUUID } from 'node:crypto';

import {
  brandIdFor,
  parseSharepicChatProps,
  SHAREPIC_PROMPT_MAX,
  stripInlineMarks,
  type SharepicBrand,
  type SharepicBerichtEintrag,
  type SharepicBrandId,
  type SharepicChatProps,
  type SharepicChatReview,
  type SharepicDraftResponse,
  type SharepicFormId,
  type SharepicSpec,
  type SharepicVariant,
  type SharepicVorlage,
  vorlageFillPrompt,
} from '@gruenerator/contracts';

import { createCutOutPainter } from '../../../services/sharepicCreator/cutOut.js';
import {
  draftSharepic,
  type SharepicPainters,
  textsOf,
} from '../../../services/sharepicCreator/draftAgent.js';
import { createIllustrationPainter } from '../../../services/sharepicCreator/illustrations.js';
import { createScenePainter } from '../../../services/sharepicCreator/sceneBackground.js';

import { type PriorSharepic } from './sharepicVariantHelpers.js';
import { type SharepicOwnPhotoWithUrl } from './turnPhotos.js';

const ALTERNATIVE_RE =
  /\b(?:ander(?:e|es|en|er)|neue[nrs]?|weitere[nrs]?|noch\s+(?:ein|eine|einen))\s+(?:variante|version|entwurf|gestaltung|vorschlag|layout|sharepic)\b|\bganz\s+anders\b/i;

// A named part makes it an edit: "neuer Vorschlag für die Headline".
const SHAREPIC_PART_RE =
  /(?<!\p{L})(?:headline|header|(?:ü|ue)berschrift(?:en)?|(?:unter|zusatz)?zeilen?|(?:unter|zusatz)?text(?:e|es|s)?|fotos?|bild(?:er|es|s)?|motive?s?|farben?|hintergrund(?:bild|farbe|es|s)?|datum|logos?|schrift(?:art|zug|farbe)?|balken|label)(?!\p{L})/iu;

/** "Eine andere Variante" asks for a fresh draft, not an edit of the last one. */
export function asksForAlternative(text: string): boolean {
  return ALTERNATIVE_RE.test(text) && !SHAREPIC_PART_RE.test(text);
}

/** The texts of a spec's first slide, without marker syntax. */
export function firstSlideText(spec: SharepicSpec): string {
  const first = spec.slides[0];
  if (!first) return '';
  return textsOf(first)
    .map((text) => stripInlineMarks(text).trim())
    .filter(Boolean)
    .join(' ');
}

function layoutOf(spec: SharepicSpec): string {
  return JSON.stringify(
    spec.slides.map((s) => ({
      hintergrund: s.background.kind,
      position: s.position,
      bausteine: s.items.map((i) => i.type),
    }))
  );
}

export function buildCreatorPrompt(args: {
  brief: string;
  background: string | null;
  avoid: SharepicSpec | null;
}): string {
  const avoid = args.avoid
    ? `\n\nEin früherer Entwurf war so aufgebaut: ${layoutOf(args.avoid)}. Gestalte diesmal deutlich anders (anderer Hintergrund, anderer Aufbau) – das Design bleibt, mit seinen Markenzeichen aus den Grundlagen.`
    : '';
  const head = `${args.brief.trim()}${avoid}`;
  if (!args.background) return head.slice(0, SHAREPIC_PROMPT_MAX);
  const label = '\n\nMaterial aus dem Gespräch (Grundlage, nichts dazuerfinden):\n';
  const room = SHAREPIC_PROMPT_MAX - head.length - label.length;
  return room > 0
    ? `${head}${label}${args.background.slice(0, room)}`
    : head.slice(0, SHAREPIC_PROMPT_MAX);
}

/** The `review` field of `sharepic_complete`, clipped to what the review accepts. */
export function reviewHint(review: SharepicChatReview): { review?: SharepicChatReview } {
  const brief = review.brief.trim().slice(0, SHAREPIC_PROMPT_MAX);
  return brief ? { review: { brief, mode: review.mode } } : {};
}

/** The editor page a creator draft opens in, per design. */
const CREATOR_CANVAS: Record<SharepicBrandId, SharepicVariant['canvasType']> = {
  'gruene-de': 'freeform',
  'gruene-at': 'freeform-at',
  'gj-de': 'freeform-gj',
  'gj-at': 'freeform-gj-at',
};

/**
 * A carousel carries one page per slide so the deck card renders each of them;
 * opening it in the editor still mints the whole spec from `initialProps`.
 */
export function toCreatorVariant(
  draft: SharepicDraftResponse,
  opts: {
    revisionOf: string | null;
    editorChangesDropped: boolean;
    /** The chat's own photos; their ids resolve to these urls when the sharepic is composed. */
    photos?: readonly SharepicOwnPhotoWithUrl[];
    /** Photos of this turn that were left out — the answer mentions them. */
    photoBericht?: readonly SharepicBerichtEintrag[];
  }
): SharepicVariant {
  const bericht = [...(opts.photoBericht ?? []), ...(draft.bericht ?? [])];
  const props: SharepicChatProps = {
    creatorSpec: draft.spec,
    attributions: draft.attributions,
    ...(bericht.length && { bericht: bericht.slice(0, 20) }),
    ...(opts.photos?.length && { photos: opts.photos.map(({ id, url }) => ({ id, url })) }),
    ...(opts.revisionOf !== null && { revisionOf: opts.revisionOf }),
    ...(opts.editorChangesDropped && { editorChangesDropped: true as const }),
  };
  const altText = firstSlideText(draft.spec);
  return {
    id: randomUUID(),
    canvasType: CREATOR_CANVAS[brandIdFor(draft.spec.locale, draft.spec.brand)],
    initialProps: props,
    label: opts.revisionOf !== null ? 'Überarbeitet' : 'Sharepic',
    ...(altText && { altText }),
    ...(draft.hinweis && { notice: draft.hinweis }),
    ...(draft.alternativen?.length && { alternativen: draft.alternativen }),
    ...(draft.spec.slides.length > 1 && {
      pages: draft.spec.slides.map((_, slide) => ({ ...props, slide })),
    }),
  };
}

export function paintersFor(userId: string | null): SharepicPainters {
  return userId
    ? {
        scene: createScenePainter(userId),
        illustrations: createIllustrationPainter(userId),
        cutOut: createCutOutPainter(userId),
      }
    : {};
}

export async function createCreatorSharepic(args: {
  brief: string;
  background: string | null;
  avoid: SharepicSpec | null;
  locale: 'de-DE' | 'de-AT';
  /** The design the request names („GJ-Design“); a Vorlage brings its own. */
  brand: SharepicBrand | null;
  userId: string | null;
  /** The person's own words: they alone order a form or a slide count, never the appended conversation. */
  request: string;
  /** A form picked by the chat's „Als …" chip; otherwise the creator reads `request`. */
  form: SharepicFormId | null;
  /** A request that leaves the slide count open gets one slide. */
  oneSlide: boolean;
  /** A catalogue Vorlage the person picked: its layout is filled, not redrafted. */
  vorlage?: SharepicVorlage | null;
  /** The person's own photos of this chat, analysed and stored. */
  photos: readonly SharepicOwnPhotoWithUrl[];
  photoBericht?: readonly SharepicBerichtEintrag[];
}): Promise<SharepicVariant> {
  const { vorlage } = args;
  // Only the request's own dates must reach the sharepic, not the material's.
  const draft = vorlage
    ? await draftSharepic(
        vorlageFillPrompt(buildCreatorPrompt({ ...args, avoid: null })).slice(
          0,
          SHAREPIC_PROMPT_MAX
        ),
        args.locale,
        vorlage.spec,
        args.photos,
        paintersFor(args.userId),
        vorlage.form,
        args.brief
      )
    : await draftSharepic(
        buildCreatorPrompt(args),
        args.locale,
        null,
        args.photos,
        paintersFor(args.userId),
        args.form,
        args.brief,
        null,
        null,
        args.oneSlide,
        args.brand,
        false,
        args.request
      );
  // A themed Vorlage's theme is part of the look the person picked: the model
  // drops it now and then (a remembrance on plain green), so it is kept here.
  const thema = vorlage?.spec.thema;
  const spec = thema && !draft.spec.thema ? { ...draft.spec, thema } : draft.spec;
  return toCreatorVariant(
    { ...draft, spec },
    {
      revisionOf: null,
      editorChangesDropped: false,
      photos: args.photos,
      ...(args.photoBericht && { photoBericht: args.photoBericht }),
    }
  );
}

export async function reviseCreatorSharepic(args: {
  instruction: string;
  prior: PriorSharepic;
  spec: SharepicSpec;
  userId: string | null;
  /** Photos the revised sharepic already holds plus this turn's. */
  photos: readonly SharepicOwnPhotoWithUrl[];
  photoBericht?: readonly SharepicBerichtEintrag[];
}): Promise<SharepicVariant> {
  const instruction = args.instruction.slice(0, SHAREPIC_PROMPT_MAX);
  const draft = await draftSharepic(
    instruction,
    args.spec.locale,
    args.spec,
    args.photos,
    paintersFor(args.userId),
    null,
    instruction,
    null,
    null,
    false,
    null,
    // The report of the draft being revised said the Termin was missing: it still is, unless this edit added one.
    (parseSharepicChatProps(args.prior.props)?.bericht ?? []).some(
      (e) => e.art === 'fehlt' && e.fakt === 'termin'
    )
  );
  return toCreatorVariant(draft, {
    revisionOf: args.prior.variantId,
    editorChangesDropped: args.prior.canvasId !== null,
    photos: args.photos,
    ...(args.photoBericht && { photoBericht: args.photoBericht }),
  });
}
