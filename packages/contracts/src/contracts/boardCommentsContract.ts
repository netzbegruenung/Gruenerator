/**
 * ts-rest contract for /api/board-comments
 *
 * Comment threads and emoji reactions on board cards.
 * Mirrors apps/api/routes/boards/boardCommentsController.ts.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  createCommentBodySchema,
  updateCommentBodySchema,
  addReactionBodySchema,
  commentListResponseSchema,
  commentCountResponseSchema,
  boardCommentSchema,
  boardCommentRowSchema,
  commentReactionSchema,
  reactionAlreadyExistsResponseSchema,
  boardCommentSuccessResponseSchema,
  boardCommentErrorResponseSchema,
} from '../schemas/boardComments.js';

const c = initContract();

export const boardCommentsContract = c.router(
  {
    /** GET /api/board-comments/:boardId/cards/:cardId/comments */
    listComments: {
      method: 'GET',
      path: '/api/board-comments/:boardId/cards/:cardId/comments',
      pathParams: z.object({ boardId: z.string(), cardId: z.string() }),
      responses: {
        200: commentListResponseSchema,
        401: boardCommentErrorResponseSchema,
        403: boardCommentErrorResponseSchema,
        500: boardCommentErrorResponseSchema,
      },
      summary: 'List comments for a card',
    },

    /** POST /api/board-comments/:boardId/cards/:cardId/comments */
    createComment: {
      method: 'POST',
      path: '/api/board-comments/:boardId/cards/:cardId/comments',
      pathParams: z.object({ boardId: z.string(), cardId: z.string() }),
      body: createCommentBodySchema,
      responses: {
        201: boardCommentSchema,
        400: boardCommentErrorResponseSchema,
        401: boardCommentErrorResponseSchema,
        403: boardCommentErrorResponseSchema,
        404: boardCommentErrorResponseSchema,
        500: boardCommentErrorResponseSchema,
      },
      summary: 'Create a comment or reply',
    },

    /** PUT /api/board-comments/:boardId/comments/:commentId */
    updateComment: {
      method: 'PUT',
      path: '/api/board-comments/:boardId/comments/:commentId',
      pathParams: z.object({ boardId: z.string(), commentId: z.string() }),
      body: updateCommentBodySchema,
      responses: {
        200: boardCommentRowSchema,
        400: boardCommentErrorResponseSchema,
        401: boardCommentErrorResponseSchema,
        403: boardCommentErrorResponseSchema,
        404: boardCommentErrorResponseSchema,
        500: boardCommentErrorResponseSchema,
      },
      summary: 'Edit an own comment',
    },

    /** DELETE /api/board-comments/:boardId/comments/:commentId */
    deleteComment: {
      method: 'DELETE',
      path: '/api/board-comments/:boardId/comments/:commentId',
      pathParams: z.object({ boardId: z.string(), commentId: z.string() }),
      body: z.object({}),
      responses: {
        200: boardCommentSuccessResponseSchema,
        401: boardCommentErrorResponseSchema,
        403: boardCommentErrorResponseSchema,
        404: boardCommentErrorResponseSchema,
        500: boardCommentErrorResponseSchema,
      },
      summary: 'Delete a comment (author or board owner)',
    },

    /** POST /api/board-comments/:boardId/comments/:commentId/reactions */
    addReaction: {
      method: 'POST',
      path: '/api/board-comments/:boardId/comments/:commentId/reactions',
      pathParams: z.object({ boardId: z.string(), commentId: z.string() }),
      body: addReactionBodySchema,
      responses: {
        200: reactionAlreadyExistsResponseSchema,
        201: commentReactionSchema,
        401: boardCommentErrorResponseSchema,
        403: boardCommentErrorResponseSchema,
        500: boardCommentErrorResponseSchema,
      },
      summary: 'Add an emoji reaction',
    },

    /** DELETE /api/board-comments/:boardId/comments/:commentId/reactions/:emoji */
    removeReaction: {
      method: 'DELETE',
      path: '/api/board-comments/:boardId/comments/:commentId/reactions/:emoji',
      pathParams: z.object({
        boardId: z.string(),
        commentId: z.string(),
        emoji: z.string(),
      }),
      body: z.object({}),
      responses: {
        200: boardCommentSuccessResponseSchema,
        401: boardCommentErrorResponseSchema,
        403: boardCommentErrorResponseSchema,
        500: boardCommentErrorResponseSchema,
      },
      summary: 'Remove an emoji reaction',
    },

    /** GET /api/board-comments/:boardId/cards/:cardId/comment-count */
    getCommentCount: {
      method: 'GET',
      path: '/api/board-comments/:boardId/cards/:cardId/comment-count',
      pathParams: z.object({ boardId: z.string(), cardId: z.string() }),
      responses: {
        200: commentCountResponseSchema,
        401: boardCommentErrorResponseSchema,
        403: boardCommentErrorResponseSchema,
        500: boardCommentErrorResponseSchema,
      },
      summary: 'Count comments on a card',
    },
  },
  { pathPrefix: '' }
);
