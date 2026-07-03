import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  boardCardDocumentErrorResponseSchema,
  cardDocumentListResponseSchema,
  cardDocumentSuccessResponseSchema,
} from '../schemas/boardCardDocuments.js';

const c = initContract();

export const boardCardDocumentsContract = c.router(
  {
    listCardDocuments: {
      method: 'GET',
      path: '/api/board-card-documents/:boardId/cards/:cardId/documents',
      pathParams: z.object({ boardId: z.string(), cardId: z.string() }),
      responses: {
        200: cardDocumentListResponseSchema,
        401: boardCardDocumentErrorResponseSchema,
        403: boardCardDocumentErrorResponseSchema,
        500: boardCardDocumentErrorResponseSchema,
      },
      summary: 'List agent-created documents linked to a card',
    },
    unlinkCardDocument: {
      method: 'DELETE',
      path: '/api/board-card-documents/:boardId/documents/:linkId',
      pathParams: z.object({ boardId: z.string(), linkId: z.string() }),
      body: z.object({}),
      responses: {
        200: cardDocumentSuccessResponseSchema,
        401: boardCardDocumentErrorResponseSchema,
        403: boardCardDocumentErrorResponseSchema,
        404: boardCardDocumentErrorResponseSchema,
        500: boardCardDocumentErrorResponseSchema,
      },
      summary: 'Remove the link row (does not delete the underlying document)',
    },
  },
  { pathPrefix: '' }
);
