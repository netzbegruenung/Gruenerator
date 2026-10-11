/**
 * Changes the text of an existing explainable from a chat instruction (#4459).
 *
 * Only the text: an image keeps its picture when its section stays at the same
 * place under the same heading (the PNG is stored by section index), and no new
 * picture is painted — painting books tree budget per day and is its own job.
 * The sources stay the explainable's own; markers the model invents are
 * dropped as on creation.
 */
import {
  type ExplainableContent,
  type ExplainableDraft,
  type ExplainableSection,
} from '@gruenerator/contracts';

import { createLogger } from '../../utils/logger.js';
import { aiObject } from '../ai/generate.js';

import {
  buildSystemPrompt,
  DRAFT_TOOL_SCHEMA,
  toContent,
  validateDraft,
  withUsage,
} from './createExplainable.js';
import { getOwnExplainable, updateExplainableContent } from './explainableRepository.js';

const log = createLogger('reviseExplainable');

export type ReviseExplainableResult =
  | { status: 'revised'; title: string; summary: string; keptImages: number }
  | { status: 'needs_confirmation'; title: string; removedHeadings: string[] }
  | { status: 'failed'; message: string };

/** Pictures survive only where the section did not move or get renamed. */
export function carryImages(
  next: ExplainableContent,
  previous: ExplainableContent
): ExplainableContent {
  return {
    ...next,
    sections: next.sections.map((section, i): ExplainableSection => {
      const { image: _drafted, ...text } = section;
      const old = previous.sections[i];
      return old?.image && old.heading === section.heading ? { ...text, image: old.image } : text;
    }),
  };
}

export function removedHeadings(next: ExplainableContent, previous: ExplainableContent): string[] {
  const kept = new Set(next.sections.map((s) => s.heading));
  return previous.sections.map((s) => s.heading).filter((h) => !kept.has(h));
}

export function describeExplainable(content: ExplainableContent): string {
  const sections = content.sections
    .map(
      (s, i) =>
        `Abschnitt ${i + 1}: ${s.heading}${s.image ? ' [mit Erklärbild]' : ''}\n${s.paragraphs.join('\n')}`
    )
    .join('\n\n');
  return [
    `# ${content.title}`,
    content.summary,
    sections,
    `Das Wichtigste:\n- ${content.keyTakeaways.join('\n- ')}`,
  ].join('\n\n');
}

export async function reviseExplainable(opts: {
  userId: string;
  explainableId: string;
  instruction: string;
  locale: 'de-DE' | 'de-AT';
  /** false: a revision that drops sections is not saved. */
  removalAllowed: boolean;
}): Promise<ReviseExplainableResult> {
  const row = await getOwnExplainable(opts.userId, opts.explainableId);
  if (!row) {
    return { status: 'failed', message: 'Das Explainable wurde nicht gefunden.' };
  }
  if (row.status === 'images_pending') {
    return {
      status: 'failed',
      message: 'Die Erklärbilder werden gerade noch gemalt — bitte gleich noch einmal versuchen.',
    };
  }
  const previous = row.content as ExplainableContent;

  const generated = await withUsage(opts.userId, () =>
    aiObject<ExplainableDraft>({
      lane: 'explainable',
      system: `${buildSystemPrompt(opts.locale)}

## ÜBERARBEITUNG
Du überarbeitest eine bestehende Erklärseite. Setze NUR die Änderung um, um die gebeten wird; alles andere bleibt wörtlich, in derselben Reihenfolge und mit denselben Überschriften. Behalte die Quellenmarker.`,
      prompt: `## BESTEHENDE ERKLÄRSEITE (JSON)\n${JSON.stringify({ ...previous, sources: undefined })}\n\n## QUELLEN\n${previous.sources.map((s) => `[${s.index}] ${s.title}`).join('\n') || '(keine)'}\n\n## ÄNDERUNG\n${opts.instruction}`,
      toolName: 'create_explainable',
      toolDescription: 'Gibt die überarbeitete Erklärseite zurück.',
      schema: DRAFT_TOOL_SCHEMA,
      validate: validateDraft,
      temperature: 0.2,
      label: 'explainable_revise',
    })
  );
  if (!generated.ok) {
    log.warn(`revision failed for ${row.id}: ${generated.error}`);
    return {
      status: 'failed',
      message:
        'Die Änderung am Explainable konnte nicht erstellt werden. Versuch es bitte noch einmal.',
    };
  }

  const next = carryImages(toContent(generated.data, previous.sources), previous);
  const removed = removedHeadings(next, previous);
  if (removed.length > 0 && !opts.removalAllowed) {
    return { status: 'needs_confirmation', title: previous.title, removedHeadings: removed };
  }
  if (!(await updateExplainableContent(row.id, opts.userId, next))) {
    return {
      status: 'failed',
      message:
        'Das Explainable konnte nicht gespeichert werden. Versuch es bitte gleich noch einmal.',
    };
  }
  return {
    status: 'revised',
    title: next.title,
    summary: next.summary,
    keptImages: next.sections.filter((s) => s.image).length,
  };
}
