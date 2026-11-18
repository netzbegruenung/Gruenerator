/**
 * „Mit KI hinzufügen" in the canvas editor's page picker: one more page for
 * a design. The picker hands over the catalogue Seiten that look like the
 * design (colour, photo, theme — it ranks them, the server does not see the
 * pages); the creator picks the one whose kind continues the content best
 * and writes its text, as a revision of that Seite's one-slide spec.
 */
import {
  nextSeitePrompt,
  sharepicSeiteSpec,
  type SharepicBrand,
  type SharepicCreatorLocale,
  type SharepicFormat,
  type SharepicNextSeiteResponse,
  type SharepicSeite,
} from '@gruenerator/contracts';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { aiObject } from '../ai/generate.js';
import { listSharepicSeiten } from '../sharepicVorlagen/catalog.js';

import { draftSharepic, PINNED } from './draftAgent.js';
import { fromZod } from './draftValidation.js';

import type { SharepicPainters } from './draftPainting.js';

const log = createLogger('sharepicNextSeite');

const ROLLE: Record<SharepicSeite['rolle'], string> = {
  titel: 'Titelseite',
  inhalt: 'Inhaltsseite',
  schluss: 'Schlussseite',
};

/** None of the candidates is a Seite of the format in the viewer's catalogue. */
export class NoFittingSeiteError extends Error {}

/**
 * The candidates the viewer's catalogue holds in `format`, in the picker's
 * order (most like the design first); unknown and repeated ids drop out.
 */
export function knownCandidates(
  ids: readonly string[],
  format: SharepicFormat,
  locale: SharepicCreatorLocale,
  brand: SharepicBrand
): SharepicSeite[] {
  const byId = new Map(
    listSharepicSeiten(locale, brand)
      .filter((seite) => seite.formats.includes(format))
      .map((seite) => [seite.id, seite])
  );
  return [...new Set(ids)].flatMap((id) => byId.get(id) ?? []);
}

const candidateLine = (seite: SharepicSeite) =>
  `${seite.id} · ${seite.titel} · ${ROLLE[seite.rolle]}, ${seite.typ}`;

/**
 * Which Seite carries the content on. The look is settled already — every
 * candidate fits the design — so a failed pick falls back to the one most
 * like it rather than failing the page.
 */
export async function pickSeite(
  candidates: readonly SharepicSeite[],
  deck: string
): Promise<SharepicSeite> {
  const [first] = candidates;
  if (!first) throw new NoFittingSeiteError('no candidates');
  if (candidates.length === 1) return first;
  const ids = candidates.map((seite) => seite.id) as [string, ...string[]];
  const pick = z.object({ seite: z.enum(ids), grund: z.string().max(300) });
  const result = await aiObject({
    lane: 'sharepic_creator',
    pinned: PINNED,
    // No party named: the same pick serves DE, AT and the Grüne Jugend.
    system:
      'Du baust Sharepic-Karussells. Du wählst die Seitenvorlage, mit der ein Karussell am besten weitergeht.',
    prompt: `Die bisherigen Seiten:\n${deck}\n\nZur Wahl (id · Titel · Art):\n${candidates.map(candidateLine).join('\n')}\n\nWelche Vorlage passt als nächste Seite am besten zum Inhalt? Eine Titelseite nur, wenn noch keine da ist; eine Schlussseite, wenn der Inhalt erzählt ist; sonst die Art, die der Inhalt als Nächstes braucht (Liste für Punkte, Zitat für eine Stimme, Frage oder Aufruf zum Mitmachen).`,
    toolName: 'seite_waehlen',
    toolDescription:
      'Melde die id der Seitenvorlage, die als nächste Seite passt, und in einem Satz, warum.',
    schema: {
      type: 'object',
      properties: { seite: { type: 'string', enum: ids }, grund: { type: 'string' } },
      required: ['seite', 'grund'],
    },
    validate: (input) => fromZod(pick, input),
    maxOutputTokens: 400,
    label: 'sharepicCreator:nextSeite',
  });
  if (!result.ok) {
    log.warn(`pick failed, taking the closest look: ${result.error}`);
    return first;
  }
  log.info(`picked ${result.data.seite}: ${result.data.grund}`);
  return candidates.find((seite) => seite.id === result.data.seite) ?? first;
}

export async function draftNextSeite(request: {
  candidates: readonly string[];
  deck: string;
  format: SharepicFormat;
  locale: SharepicCreatorLocale;
  brand: SharepicBrand;
  painters: SharepicPainters;
}): Promise<SharepicNextSeiteResponse> {
  const candidates = knownCandidates(
    request.candidates,
    request.format,
    request.locale,
    request.brand
  );
  const seite = await pickSeite(candidates, request.deck);
  const draft = await draftSharepic(
    nextSeitePrompt(request.deck),
    request.locale,
    sharepicSeiteSpec(seite, request.format),
    [],
    request.painters
  );
  // The Seite is one page; a draft that grew more slides keeps its first.
  return {
    seiteId: seite.id,
    spec: { ...draft.spec, slides: draft.spec.slides.slice(0, 1) },
    attributions: draft.attributions.slice(0, 1),
  };
}
