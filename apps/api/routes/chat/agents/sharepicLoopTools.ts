/**
 * Loop tools for the chat sharepic: `read_sharepic` and `edit_sharepic`. They
 * act on the creator sharepic of the thread (`resolveLoopSharepicTarget`), so
 * the model no longer has to claim an edit it cannot make. The regex lane in
 * `earlyHandlerStage` stays in front of the loop; these catch the follow-ups
 * it misses.
 */
import { isDeepStrictEqual } from 'node:util';

import { stripInlineMarks, type SharepicSpec } from '@gruenerator/contracts';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { DraftFailedError, textsOf } from '../../../services/sharepicCreator/draftAgent.js';
import { draftFailedText } from '../../../services/sharepicCreator/draftFailure.js';
import { toUserFacingMessage } from '../../../utils/errors/index.js';
import { createLogger } from '../../../utils/logger.js';
import { reviseCreatorSharepic } from '../services/sharepicCreatorVariant.js';
import { resolveLoopSharepicTarget } from '../services/sharepicLoopTarget.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const log = createLogger('SharepicLoopTools');

/** Each draft is two LLM calls plus painters; two edits cover "ändern + nachbessern". */
export const MAX_SHAREPIC_EDITS_PER_TURN = 2;

const NO_TARGET =
  'In diesem Gespräch gibt es kein Sharepic aus dem Creator. Vorlagen-Sharepics lassen sich im Studio bearbeiten.';

interface LoopToolCtx {
  sse: SSEWriter;
  state: ChatGraphState;
  threadId: string;
}

function compactSpec(spec: SharepicSpec): unknown {
  return spec.slides.map((slide, index) => ({
    folie: index + 1,
    hintergrund: slide.background.kind,
    bausteine: slide.items.map((item) => item.type),
    texte: textsOf(slide).map((text) => stripInlineMarks(text).trim()),
  }));
}

export function makeReadSharepicTool(ctx: LoopToolCtx): Tool {
  const { state, threadId } = ctx;
  return tool({
    description: `Liest ein Sharepic/Karussell dieses Gesprächs: Folien, Hintergrund und alle Texte. Kein Bild, keine Änderung.

NUTZE bei Fragen zum Sharepic ("was steht drauf", "wie viele Folien") und vor einer Änderung nur, wenn unklar ist, welches Feld oder welches Sharepic gemeint ist. Standard ist die geöffnete Karte.`,
    inputSchema: z.object({
      variantId: z
        .string()
        .optional()
        .describe('ID eines bestimmten Sharepics; leer = die geöffnete bzw. neueste Karte'),
    }),
    execute: async ({ variantId }) => {
      const target = await resolveLoopSharepicTarget(threadId, state.currentSharepic, variantId);
      const spec = target?.props.creatorSpec;
      if (!target || !spec) return { error: NO_TARGET };
      return {
        variantId: target.prior.variantId,
        slideCount: spec.slides.length,
        spec: compactSpec(spec),
      };
    },
  });
}

export function makeEditSharepicTool(ctx: LoopToolCtx): Tool {
  const { sse, state, threadId } = ctx;
  // Counts drafts that STARTED: a call the loop wrote off on timeout keeps drafting.
  let drafts = 0;
  return tool({
    description: `Überarbeitet ein bestehendes Sharepic/Karussell dieses Gesprächs: Texte, Aufbau, Hintergrund, Folien. Es entsteht eine neue Karte; die alte bleibt.

NUTZE bei JEDER Änderung an einem vorhandenen Sharepic. Ohne variantId ist die geöffnete (sonst die neueste) Karte das Ziel. "anweisung" ist der Wortlaut der Person, ergänzt um konkrete Texte. Fasse Änderungen in einen Aufruf. NICHT für ein neues Sharepic.`,
    inputSchema: z.object({
      anweisung: z
        .string()
        .min(1)
        .describe('Was geändert werden soll — im Wortlaut der Person, mit konkreten Texten'),
      variantId: z
        .string()
        .optional()
        .describe('ID eines bestimmten Sharepics; leer = die geöffnete bzw. neueste Karte'),
    }),
    execute: async ({ anweisung, variantId }) => {
      if (drafts >= MAX_SHAREPIC_EDITS_PER_TURN) {
        return {
          error:
            'In diesem Zug wurde das Sharepic schon zweimal überarbeitet — weitere Änderungen bitte in der nächsten Nachricht.',
        };
      }
      const target = await resolveLoopSharepicTarget(threadId, state.currentSharepic, variantId);
      const spec = target?.props.creatorSpec;
      if (!target || !spec) return { error: NO_TARGET };

      drafts += 1;
      sse.send('image_start', { message: 'Überarbeite dein Sharepic…' });
      try {
        const variant = await reviseCreatorSharepic({
          instruction: anweisung,
          prior: target.prior,
          spec,
          userId: state.agentConfig?.userId ?? null,
        });
        const revised = (variant.initialProps as { creatorSpec?: SharepicSpec }).creatorSpec;
        if (revised && isDeepStrictEqual(revised, spec)) {
          // `error` marks the step as failed, so the no-phantom-edit guard still applies.
          return {
            error:
              'Das Sharepic blieb unverändert — diese Änderung ist mit dem Creator nicht möglich. Sag der Person ehrlich, dass nichts geändert wurde.',
            unchanged: true,
          };
        }
        sse.send('sharepic_complete', { message: 'Sharepic überarbeitet', variants: [variant] });
        return {
          variantId: variant.id,
          unchanged: false,
          summary: `Sharepic überarbeitet (${revised?.slides.length ?? 1} Folie(n)): ${anweisung.slice(0, 120)}`,
          variants: [variant],
        };
      } catch (error) {
        if (error instanceof DraftFailedError) {
          log.warn(`Sharepic-Überarbeitung gescheitert: ${error.message}`);
          const message = draftFailedText(
            'Die Überarbeitung ist nicht gelungen.',
            error.reason,
            'Formuliere die Änderung etwas genauer und versuch es noch einmal.'
          );
          return { error: message };
        }
        log.error('Sharepic-Überarbeitung fehlgeschlagen:', error);
        return { error: toUserFacingMessage(error, 'Sharepic-Überarbeitung fehlgeschlagen') };
      }
    },
  });
}
