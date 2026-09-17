/**
 * ts-rest router for the DeepL translator: languages, text translation,
 * document-job status and the admin glossary. `requireAuth` +
 * `requireAiConsent` sit on the `/api/translation` prefix in routes.ts; the
 * glossary handlers check `requireInstanceAdmin` per call on top.
 */
import { translationContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  DeepLError,
  getDeepLService,
  type DeepLService,
} from '../../services/translation/DeepLService.js';
import { pollDocumentJob } from '../../services/translation/documentJobs.js';
import {
  glossaryName,
  invalidateGlossaryInfo,
  registerGlossary,
  resolveGlossary,
} from '../../services/translation/glossaryRegistry.js';
import {
  translateWithGlossary,
  translationErrorMessage,
  TranslationUnavailableError,
} from '../../services/translation/translate.js';
import {
  getQuota,
  TranslationQuotaExceededError,
} from '../../services/translation/translationQuota.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('translationContractRouter');

const NOT_CONFIGURED = {
  status: 503 as const,
  body: {
    success: false as const,
    error: 'Die Übersetzung ist auf diesem Server nicht eingerichtet.',
  },
};
const FORBIDDEN = {
  status: 403 as const,
  body: { success: false as const, error: 'Keine Admin-Berechtigung.' },
};

function upstreamFailure(error: unknown) {
  log.warn(`[translation] DeepL call failed: ${(error as Error).message}`);
  return {
    status: 502 as const,
    body: { success: false as const, error: translationErrorMessage(error) },
  };
}

const s = initServer();

export const translationContractRouter = s.router(translationContract, {
  getLanguages: async (args) => {
    const user = getAuthedUser(args.req);
    const service = getDeepLService();
    if (!service) return NOT_CONFIGURED;
    try {
      const [languages, quota] = await Promise.all([service.getLanguages(), getQuota(user.id)]);
      let glossaryPairs: string[] = [];
      try {
        glossaryPairs = (await resolveGlossary(service))?.pairs ?? [];
      } catch (error) {
        log.warn(`[translation] glossary lookup failed: ${(error as Error).message}`);
      }
      return { status: 200 as const, body: { languages, glossaryPairs, quota } };
    } catch (error) {
      return upstreamFailure(error);
    }
  },

  translateText: async (args) => {
    const user = getAuthedUser(args.req);
    try {
      const result = await translateWithGlossary({
        userId: user.id,
        text: args.body.text,
        targetLang: args.body.targetLang,
        sourceLang: args.body.sourceLang ?? null,
        formality: args.body.formality ?? null,
      });
      return { status: 200 as const, body: result };
    } catch (error) {
      if (error instanceof TranslationQuotaExceededError) {
        return {
          status: 429 as const,
          body: {
            success: false as const,
            error: translationErrorMessage(error),
            quota: error.quota,
          },
        };
      }
      if (error instanceof TranslationUnavailableError) return NOT_CONFIGURED;
      if (error instanceof DeepLError && error.status === 400) {
        return {
          status: 400 as const,
          body: { success: false as const, error: translationErrorMessage(error) },
        };
      }
      if (error instanceof DeepLError) return upstreamFailure(error);
      log.error('[translation.translateText] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: translationErrorMessage(error) },
      };
    }
  },

  getDocumentStatus: async (args) => {
    const user = getAuthedUser(args.req);
    try {
      const status = await pollDocumentJob(args.params.jobId, user.id);
      if (!status) {
        return {
          status: 404 as const,
          body: { success: false as const, error: 'Diese Übersetzung ist nicht (mehr) bekannt.' },
        };
      }
      return { status: 200 as const, body: status };
    } catch (error) {
      if (error instanceof TranslationUnavailableError) return NOT_CONFIGURED;
      return upstreamFailure(error);
    }
  },

  getGlossary: async (args) => {
    const user = getAuthedUser(args.req);
    if (!(await requireInstanceAdmin(user.id, user.email))) return FORBIDDEN;
    const service = getDeepLService();
    if (!service) return NOT_CONFIGURED;
    try {
      const info = await resolveGlossary(service);
      if (!info) {
        return {
          status: 200 as const,
          body: { glossaryId: null, name: glossaryName(), dictionaries: [] },
        };
      }
      const glossary = await service.getGlossary(info.glossaryId);
      const dictionaries = await Promise.all(
        glossary.dictionaries.map(async (d) => ({
          sourceLang: d.sourceLang,
          targetLang: d.targetLang,
          entries: await service.getDictionaryEntries(info.glossaryId, d),
        }))
      );
      return {
        status: 200 as const,
        body: { glossaryId: glossary.glossaryId, name: glossary.name, dictionaries },
      };
    } catch (error) {
      return upstreamFailure(error);
    }
  },

  putGlossaryDictionary: async (args) => {
    const user = getAuthedUser(args.req);
    if (!(await requireInstanceAdmin(user.id, user.email))) return FORBIDDEN;
    const service = getDeepLService();
    if (!service) return NOT_CONFIGURED;
    const { sourceLang, targetLang, entries } = args.body;
    try {
      await upsertDictionary(service, { sourceLang, targetLang }, entries);
      log.info(
        `[translation] admin ${user.id} saved glossary ${sourceLang}>${targetLang} (${entries.length} entries)`
      );
      return { status: 200 as const, body: { sourceLang, targetLang, entries } };
    } catch (error) {
      if (error instanceof DeepLError && error.status === 400) {
        return {
          status: 400 as const,
          body: { success: false as const, error: translationErrorMessage(error) },
        };
      }
      return upstreamFailure(error);
    }
  },

  deleteGlossaryDictionary: async (args) => {
    const user = getAuthedUser(args.req);
    if (!(await requireInstanceAdmin(user.id, user.email))) return FORBIDDEN;
    const service = getDeepLService();
    if (!service) return NOT_CONFIGURED;
    const { sourceLang, targetLang } = args.query;
    try {
      const info = await resolveGlossary(service);
      if (!info || !info.pairs.includes(`${sourceLang}>${targetLang}`)) {
        return {
          status: 404 as const,
          body: {
            success: false as const,
            error: 'Für dieses Sprachpaar gibt es kein Wörterbuch.',
          },
        };
      }
      await service.deleteDictionary(info.glossaryId, { sourceLang, targetLang });
      await invalidateGlossaryInfo();
      log.info(`[translation] admin ${user.id} deleted glossary ${sourceLang}>${targetLang}`);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      return upstreamFailure(error);
    }
  },
});

/** Replace one pair's dictionary, creating the account glossary on first save. */
async function upsertDictionary(
  service: DeepLService,
  pair: { sourceLang: string; targetLang: string },
  entries: ReadonlyArray<{ source: string; target: string }>
): Promise<void> {
  const info = await resolveGlossary(service);
  if (!info) {
    const created = await service.createGlossary(glossaryName(), [{ ...pair, entries }]);
    await registerGlossary(created);
    return;
  }
  await service.replaceDictionary(info.glossaryId, pair, entries);
  await invalidateGlossaryInfo();
}

export function mountTranslationContractRouter(app: Application): void {
  createExpressEndpoints(translationContract, translationContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'translationContract'),
  });
}
