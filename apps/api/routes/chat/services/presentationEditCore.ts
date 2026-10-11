/**
 * Planen und Anwenden einer Präsentations-Änderung für das Loop-Werkzeug
 * `edit_presentation` — derselbe Planer wie im Editor, angewendet serverseitig
 * auf das Live-Deck (presentationOpsService).
 */
import {
  formatPresentationAsContext,
  loadPresentationState,
} from '../../../services/presentations/PresentationGenerationService.js';
import { applyPresentationOpsLive } from '../../../services/presentations/presentationOpsService.js';
import { createLogger } from '../../../utils/logger.js';
import { checkDocumentWriteAccess } from '../../docs/documentAccess.js';
import { generatePresentationOperations } from '../../presentations/presentationAiService.js';

import { describeEditorOpsForPeople, planEditorOps } from './editorOpsCore.js';

const log = createLogger('PresentationEditCore');

export type PresentationEditOutcome =
  | {
      status: 'applied';
      title: string;
      summary: string;
      applied: number;
      skipped: string[];
      live: boolean;
    }
  | { status: 'needs_confirmation'; title: string; summary: string }
  | { status: 'failed'; message: string };

export async function planAndApplyPresentationEdit(opts: {
  presentationId: string;
  userId: string;
  instruction: string;
  /** false: Löschungen werden geplant, aber nicht geschrieben. */
  destructiveAllowed: boolean;
}): Promise<PresentationEditOutcome> {
  const { presentationId, userId, instruction } = opts;
  if (!(await checkDocumentWriteAccess(presentationId, userId))) {
    return {
      status: 'failed',
      message: 'Du hast keine Bearbeitungsrechte für diese Präsentation.',
    };
  }
  const state = await loadPresentationState(presentationId, userId);
  if (!state) {
    return {
      status: 'failed',
      message: 'Ich konnte die Präsentation nicht finden — vielleicht wurde sie gelöscht.',
    };
  }

  const planned = await planEditorOps({
    log,
    logLabel: '[PresentationEdit]',
    plan: () =>
      generatePresentationOperations({
        userPrompt: instruction,
        presentationContext: formatPresentationAsContext(state),
        brand: state.brand,
      }),
  });
  if (!planned.ok) {
    return {
      status: 'failed',
      message:
        planned.reason === 'planning_failed'
          ? 'Die Änderung an der Präsentation konnte nicht geplant werden. Versuch es bitte noch einmal.'
          : 'Ich konnte daraus keine konkrete Folien-Änderung ableiten. Beschreib bitte genauer, was sich ändern soll.',
    };
  }

  const { operations } = planned;
  const summary = describeEditorOpsForPeople(operations);
  if (!opts.destructiveAllowed && operations.some((op) => op.type === 'delete_slide')) {
    return { status: 'needs_confirmation', title: state.title, summary };
  }

  try {
    const result = await applyPresentationOpsLive(presentationId, operations);
    if (result.applied === 0) {
      return {
        status: 'failed',
        message: `An der Präsentation hat sich nichts geändert: ${result.skipped.join(' ') || 'keine passende Folie.'}`,
      };
    }
    return { status: 'applied', title: state.title, summary, ...result };
  } catch (err) {
    log.error(
      `[PresentationEdit] writing ${operations.length} op(s) to ${presentationId} failed: ${err}`
    );
    return {
      status: 'failed',
      message:
        'Die Änderung konnte nicht in die Präsentation geschrieben werden. Versuch es bitte gleich noch einmal.',
    };
  }
}
