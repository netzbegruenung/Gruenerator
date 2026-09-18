/**
 * ts-rest contract router for per-user learned writing styles ("Texte anlernen").
 *
 * Covers list / analyze / draft / save / remove, the two discovery feeds
 * (public, mentionable), the group share endpoints (PUT and DELETE
 * /api/text-forms/:mention/share) and the visibility axis
 * (:mention/share, /share/mode, /share/is-public).
 *
 * requireAuth is applied at the /api/text-forms prefix in routes.ts.
 *
 * Jede Route mit `:mention` normalisiert den Pfad-Parameter über
 * `normalizeTextFormMention`. Gespeichert wird die kanonische Mention (das tut
 * `save` über das Urteil), und ein führendes `@`/`/` oder ein zurückgezogenes
 * Kürzel in der URL träfe sonst keine Zeile — die Route antwortete mit 404 auf
 * ein Rezept, das es gibt.
 */

import { userTextFormsContract } from '@gruenerator/contracts';
import { landesverbandIdsForRoles } from '@gruenerator/shared/agents';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { loadUserRoles } from '../../services/roles/userRoles.js';
import { analyzeTextForm, textTypeLabel } from '../../services/user/textFormAnalysisService.js';
import { draftRecipeSpec } from '../../services/user/textFormDraftService.js';
import { normalizeTextFormMention, resolveTextFormKind } from '../../services/user/textFormKind.js';
import {
  deleteTextForm,
  getTextFormSharing,
  listMentionableTextForms,
  listPublicTextForms,
  listTextForms,
  shareTextFormWithGroup,
  unshareTextFormFromGroup,
  updateTextFormSharing,
  upsertTextForm,
  type TextFormSharingPatch,
} from '../../services/user/textFormRepository.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { collectTakenMentions, sharingFailure } from './textFormRouterHelpers.js';

import type { Application } from 'express';

const log = createLogger('userTextFormsContractRouter');

/**
 * The settings as they stand AFTER a write — never the request echo: the
 * repository narrows a patch on its own (un-listing when the mode steps down,
 * clearing the attestation when the listing goes), so only a re-read tells the
 * client what actually landed.
 */
async function freshSettingsResponse(userId: string, mention: string) {
  const sharing = await getTextFormSharing(userId, mention);
  if (!sharing) {
    return { status: 404 as const, body: { success: false, message: 'Rezept nicht gefunden.' } };
  }
  return {
    status: 200 as const,
    body: {
      share_mode: sharing.share_mode,
      is_public: sharing.is_public,
      public_ownership: sharing.public_ownership,
    },
  };
}

const s = initServer();

export const userTextFormsContractRouter = s.router(userTextFormsContract, {
  list: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const forms = await listTextForms(userId);
      return { status: 200 as const, body: { success: true, forms } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.list] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  analyze: async (args) => {
    try {
      getAuthedUser(args.req);
      const { textType, title, examples } = args.body;
      const label = textType ? textTypeLabel(textType) : (title?.trim() ?? '').slice(0, 80);
      if (!label) {
        return {
          status: 400 as const,
          body: { success: false, message: 'textType oder title ist erforderlich.' },
        };
      }
      const { styleBlock } = await analyzeTextForm(label, examples);
      return { status: 200 as const, body: { success: true, styleBlock } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.analyze] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  // Kein eigener Rate-Limiter — die Entwurfs-Routen (Agent wie Rezept) teilen
  // sich diese Lücke, sie wird in Issue #3471 verfolgt.
  draft: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { threadId, description } = args.body;
      const takenMentions = collectTakenMentions(await listTextForms(userId));

      // Guided-assistant path: a one-shot freeform brief. No thread to load —
      // wrap it as a single user message and synthesize directly.
      if (description) {
        const spec = await draftRecipeSpec({
          messages: [{ role: 'user', content: description }],
          takenMentions,
        });
        return { status: 200 as const, body: { success: true, spec } };
      }

      // Conversational path: load the (ownership-checked) thread messages.
      if (!threadId) {
        return {
          status: 400 as const,
          body: { success: false, message: 'Noch keine Unterhaltung zum Auswerten vorhanden.' },
        };
      }
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const threads = await postgres.query<{ user_id: string }>(
        `SELECT user_id FROM chat_threads WHERE id = $1 LIMIT 1`,
        [threadId]
      );
      if (threads.length === 0) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Thread nicht gefunden.' },
        };
      }
      if (threads[0].user_id !== userId) {
        return { status: 403 as const, body: { success: false, message: 'Keine Berechtigung.' } };
      }

      const rows = await postgres.query<{ role: string; content: unknown }>(
        `SELECT role, content FROM chat_messages
         WHERE thread_id = $1 AND role IN ('user', 'assistant')
         ORDER BY created_at ASC
         LIMIT 60`,
        [threadId]
      );
      const messages = rows
        .map((r) => ({ role: r.role, content: String(r.content ?? '').trim() }))
        .filter((m) => m.content.length > 0);

      if (messages.length === 0) {
        return {
          status: 400 as const,
          body: { success: false, message: 'Noch keine Unterhaltung zum Auswerten vorhanden.' },
        };
      }

      const spec = await draftRecipeSpec({ messages, takenMentions });
      return { status: 200 as const, body: { success: true, spec } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.draft] Error:', err);
      return {
        status: 500 as const,
        body: { success: false, message: 'Entwurf konnte nicht erstellt werden.' },
      };
    }
  },

  listPublic: async (args) => {
    try {
      getAuthedUser(args.req);
      const forms = await listPublicTextForms();
      return { status: 200 as const, body: { success: true, forms } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.listPublic] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  listMentionable: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const forms = await listMentionableTextForms(userId);
      return { status: 200 as const, body: { success: true, forms } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.listMentionable] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  save: async (args) => {
    try {
      const user = getAuthedUser(args.req);
      const userId = user.id;
      const body = args.body;

      // Der `kind` einer Speicherung wird abgeleitet, nie geglaubt: `body.kind`
      // geht nur als Wunsch hinein und muss zur Mention passen.
      const verdict = resolveTextFormKind({
        mention: args.params.mention,
        requestedKind: body.kind,
        textType: body.textType,
        lvIds: landesverbandIdsForRoles(await loadUserRoles(userId), user.locale ?? 'de-DE'),
      });
      if (!verdict.ok) {
        return { status: verdict.status, body: { success: false, message: verdict.message } };
      }

      const form = await upsertTextForm(userId, {
        kind: verdict.kind,
        textType: verdict.textType,
        // Die normalisierte Mention des Urteils, nicht der rohe Pfad-Parameter.
        mention: verdict.mention,
        title: body.title,
        examples: body.examples,
        styleBlock: body.styleBlock,
        // Durchgereicht, NICHT auf `null` gefaltet: der ausgelieferte Editor
        // sendet die beiden Felder gar nicht mit, und `?? null` löschte sie
        // damit bei jedem Speichern (#3472). Ein `null` im Body leert weiter.
        description: body.description,
        iconKey: body.iconKey,
      });
      return { status: 200 as const, body: { success: true, form } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.save] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  remove: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const deleted = await deleteTextForm(userId, normalizeTextFormMention(args.params.mention));
      if (!deleted) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Textform nicht gefunden.' },
        };
      }
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.remove] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  getShareSettings: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const sharing = await getTextFormSharing(
        userId,
        normalizeTextFormMention(args.params.mention)
      );
      if (!sharing) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Rezept nicht gefunden.' },
        };
      }
      return {
        status: 200 as const,
        body: {
          share_mode: sharing.share_mode,
          is_public: sharing.is_public,
          public_ownership: sharing.public_ownership,
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.getShareSettings] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  setShareMode: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const mention = normalizeTextFormMention(args.params.mention);
      const current = await getTextFormSharing(userId, mention);
      if (!current) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Rezept nicht gefunden.' },
        };
      }

      // Agentura-Listung sitzt ATOP share_mode='authenticated'. Ein Schritt
      // zurück nimmt sie mit — `applySharingPatch` leitet dieselbe Regel noch
      // einmal ab, hier steht sie, damit der Aufruf für sich lesbar bleibt.
      const patch: TextFormSharingPatch = { share_mode: args.body.mode };
      if (args.body.mode !== 'authenticated' && current.is_public) {
        patch.is_public = false;
        patch.public_ownership = null;
      }

      const failure = sharingFailure(await updateTextFormSharing(userId, mention, patch));
      if (failure) {
        return { status: failure.status, body: { success: false, message: failure.message } };
      }
      return await freshSettingsResponse(userId, mention);
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.setShareMode] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  setIsPublic: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const mention = normalizeTextFormMention(args.params.mention);
      const current = await getTextFormSharing(userId, mention);
      if (!current) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Rezept nicht gefunden.' },
        };
      }

      const { is_public, public_ownership } = args.body;
      if (is_public && current.share_mode !== 'authenticated') {
        return {
          status: 400 as const,
          body: {
            success: false,
            message:
              'Bitte zuerst Sichtbarkeit auf „Mit Anmeldung" setzen, dann in Agentura listen.',
          },
        };
      }

      const failure = sharingFailure(
        await updateTextFormSharing(userId, mention, {
          is_public,
          public_ownership: is_public ? public_ownership : null,
        })
      );
      if (failure) {
        return { status: failure.status, body: { success: false, message: failure.message } };
      }
      return await freshSettingsResponse(userId, mention);
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.setIsPublic] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  share: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const shares = await shareTextFormWithGroup(
        userId,
        normalizeTextFormMention(args.params.mention),
        args.body.group_id
      );
      if (shares === null) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Rezept nicht gefunden.' },
        };
      }
      return { status: 200 as const, body: { success: true, sharedWithGroups: shares } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.share] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  unshare: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const shares = await unshareTextFormFromGroup(
        userId,
        normalizeTextFormMention(args.params.mention),
        args.body.group_id
      );
      if (shares === null) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Rezept nicht gefunden.' },
        };
      }
      return { status: 200 as const, body: { success: true, sharedWithGroups: shares } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.unshare] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },
});

/**
 * Mount the ts-rest user-text-forms contract router. Call from routes.ts.
 * requireAuth is applied at the /api/text-forms prefix.
 */
export function mountUserTextFormsContractRouter(app: Application): void {
  createExpressEndpoints(userTextFormsContract, userTextFormsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'userTextFormsContract'),
  });
}
