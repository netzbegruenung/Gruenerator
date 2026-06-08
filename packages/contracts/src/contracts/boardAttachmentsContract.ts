import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  attachmentListResponseSchema,
  attachmentSuccessResponseSchema,
  boardAttachmentErrorResponseSchema,
} from '../schemas/boardAttachments.js';

const c = initContract();

export const boardAttachmentsContract = c.router(
  {
    listAttachments: {
      method: 'GET',
      path: '/api/board-attachments/:boardId/cards/:cardId/attachments',
      pathParams: z.object({ boardId: z.string(), cardId: z.string() }),
      responses: {
        200: attachmentListResponseSchema,
        401: boardAttachmentErrorResponseSchema,
        403: boardAttachmentErrorResponseSchema,
        500: boardAttachmentErrorResponseSchema,
      },
      summary: 'List attachments on a card',
    },
    deleteAttachment: {
      method: 'DELETE',
      path: '/api/board-attachments/:boardId/attachments/:attachmentId',
      pathParams: z.object({ boardId: z.string(), attachmentId: z.string() }),
      body: z.object({}),
      responses: {
        200: attachmentSuccessResponseSchema,
        401: boardAttachmentErrorResponseSchema,
        403: boardAttachmentErrorResponseSchema,
        404: boardAttachmentErrorResponseSchema,
        500: boardAttachmentErrorResponseSchema,
      },
      summary: 'Delete an attachment',
    },
    setCover: {
      method: 'POST',
      path: '/api/board-attachments/:boardId/attachments/:attachmentId/cover',
      pathParams: z.object({ boardId: z.string(), attachmentId: z.string() }),
      body: z.object({ isCover: z.boolean() }),
      responses: {
        200: attachmentSuccessResponseSchema,
        401: boardAttachmentErrorResponseSchema,
        403: boardAttachmentErrorResponseSchema,
        404: boardAttachmentErrorResponseSchema,
        500: boardAttachmentErrorResponseSchema,
      },
      summary: 'Mark/unmark an image attachment as the card cover',
    },
  },
  { pathPrefix: '' }
);
