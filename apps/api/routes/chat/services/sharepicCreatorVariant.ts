/**
 * The chat's sharepic: one variant drafted by the freitext creator. The server
 * only carries the spec; every renderer composes it in the browser.
 */
import { randomUUID } from 'node:crypto';

import {
  SHAREPIC_PROMPT_MAX,
  stripInlineMarks,
  type SharepicChatProps,
  type SharepicDraftResponse,
  type SharepicFormId,
  type SharepicSpec,
  type SharepicVariant,
} from '@gruenerator/contracts';

import {
  draftSharepic,
  type SharepicPainters,
  textsOf,
} from '../../../services/sharepicCreator/draftAgent.js';
import { createIllustrationPainter } from '../../../services/sharepicCreator/illustrations.js';
import { createScenePainter } from '../../../services/sharepicCreator/sceneBackground.js';

import { type PriorSharepic } from './sharepicVariantHelpers.js';

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
    ? `\n\nEin früherer Entwurf war so aufgebaut: ${layoutOf(args.avoid)}. Gestalte diesmal deutlich anders (anderer Hintergrund, anderer Aufbau).`
    : '';
  const head = `${args.brief.trim()}${avoid}`;
  if (!args.background) return head.slice(0, SHAREPIC_PROMPT_MAX);
  const label = '\n\nMaterial aus dem Gespräch (Grundlage, nichts dazuerfinden):\n';
  const room = SHAREPIC_PROMPT_MAX - head.length - label.length;
  return room > 0
    ? `${head}${label}${args.background.slice(0, room)}`
    : head.slice(0, SHAREPIC_PROMPT_MAX);
}

/**
 * A carousel carries one page per slide so the deck card renders each of them;
 * opening it in the editor still mints the whole spec from `initialProps`.
 */
export function toCreatorVariant(
  draft: SharepicDraftResponse,
  opts: { revisionOf: string | null; editorChangesDropped: boolean }
): SharepicVariant {
  const props: SharepicChatProps = {
    creatorSpec: draft.spec,
    attributions: draft.attributions,
    ...(opts.revisionOf !== null && { revisionOf: opts.revisionOf }),
    ...(opts.editorChangesDropped && { editorChangesDropped: true as const }),
  };
  const altText = firstSlideText(draft.spec);
  return {
    id: randomUUID(),
    canvasType: draft.spec.locale === 'de-AT' ? 'freeform-at' : 'freeform',
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
    ? { scene: createScenePainter(userId), illustrations: createIllustrationPainter(userId) }
    : {};
}

export async function createCreatorSharepic(args: {
  brief: string;
  background: string | null;
  avoid: SharepicSpec | null;
  locale: 'de-DE' | 'de-AT';
  userId: string | null;
  /** Named in the user's own words — never read from the appended conversation. */
  form: SharepicFormId | null;
}): Promise<SharepicVariant> {
  // Only the request's own dates must reach the sharepic, not the material's.
  const draft = await draftSharepic(
    buildCreatorPrompt(args),
    args.locale,
    null,
    [],
    paintersFor(args.userId),
    args.form,
    args.brief
  );
  return toCreatorVariant(draft, { revisionOf: null, editorChangesDropped: false });
}

export async function reviseCreatorSharepic(args: {
  instruction: string;
  prior: PriorSharepic;
  spec: SharepicSpec;
  userId: string | null;
}): Promise<SharepicVariant> {
  const draft = await draftSharepic(
    args.instruction.slice(0, SHAREPIC_PROMPT_MAX),
    args.spec.locale,
    args.spec,
    [],
    paintersFor(args.userId)
  );
  return toCreatorVariant(draft, {
    revisionOf: args.prior.variantId,
    editorChangesDropped: args.prior.canvasId !== null,
  });
}
