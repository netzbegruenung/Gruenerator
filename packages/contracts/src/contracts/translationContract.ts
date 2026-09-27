/**
 * ts-rest contract for the DeepL translator page and its admin glossary.
 *
 * Auth (`requireAuth` + `requireAiConsent`) sits on the `/api/translation`
 * prefix in routes.ts; the glossary handlers additionally check
 * `requireInstanceAdmin` per call. The document upload (multipart) and result
 * download (binary) are raw routes on the same prefix — see
 * apps/api/routes/translation/translationUploadRouter.ts.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  glossaryDictionaryPutSchema,
  glossaryDictionaryQuerySchema,
  glossaryDictionarySchema,
  glossaryResponseSchema,
  translateTextBodySchema,
  translateTextResponseSchema,
  translationDocumentStatusResponseSchema,
  translationErrorSchema,
  translationLanguagesResponseSchema,
} from '../schemas/translation.js';

const c = initContract();

export const translationContract = c.router(
  {
    getLanguages: {
      method: 'GET',
      path: '/api/translation/languages',
      responses: {
        200: translationLanguagesResponseSchema,
        502: translationErrorSchema,
        503: translationErrorSchema,
      },
      summary: 'Sprachen, Glossar-Paare und Tagesbudget für den Übersetzer',
    },
    translateText: {
      method: 'POST',
      path: '/api/translation/text',
      body: translateTextBodySchema,
      responses: {
        200: translateTextResponseSchema,
        400: translationErrorSchema,
        429: translationErrorSchema,
        500: translationErrorSchema,
        502: translationErrorSchema,
        503: translationErrorSchema,
      },
      summary: 'Text mit DeepL übersetzen (Glossar automatisch, wenn das Paar abgedeckt ist)',
    },
    getDocumentStatus: {
      method: 'GET',
      path: '/api/translation/document/:jobId/status',
      pathParams: z.object({ jobId: z.string().min(1) }),
      responses: {
        200: translationDocumentStatusResponseSchema,
        404: translationErrorSchema,
        502: translationErrorSchema,
        503: translationErrorSchema,
      },
      summary:
        'Stand einer Dokument-Übersetzung; holt das Ergebnis beim ersten „done" auf den Server',
    },
    getGlossary: {
      method: 'GET',
      path: '/api/translation/glossary',
      responses: {
        200: glossaryResponseSchema,
        403: translationErrorSchema,
        502: translationErrorSchema,
        503: translationErrorSchema,
      },
      summary: 'Admin: das Konto-Glossar mit allen Wörterbüchern',
    },
    putGlossaryDictionary: {
      method: 'PUT',
      path: '/api/translation/glossary/dictionary',
      body: glossaryDictionaryPutSchema,
      responses: {
        200: glossaryDictionarySchema,
        400: translationErrorSchema,
        403: translationErrorSchema,
        502: translationErrorSchema,
        503: translationErrorSchema,
      },
      summary: 'Admin: Wörterbuch eines Sprachpaars ersetzen (legt das Glossar bei Bedarf an)',
    },
    deleteGlossaryDictionary: {
      method: 'DELETE',
      path: '/api/translation/glossary/dictionary',
      query: glossaryDictionaryQuerySchema,
      body: c.noBody(),
      responses: {
        200: z.object({ success: z.literal(true) }),
        403: translationErrorSchema,
        404: translationErrorSchema,
        502: translationErrorSchema,
        503: translationErrorSchema,
      },
      summary: 'Admin: Wörterbuch eines Sprachpaars löschen',
    },
  },
  { pathPrefix: '' }
);
