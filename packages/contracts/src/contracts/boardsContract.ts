/**
 * ts-rest contract for /api/boards (authenticated endpoints).
 *
 * The public, unauthenticated GET /api/boards/public/:id lives in its own
 * publicBoardsContract because it must be mounted before the requireAuth gate.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  generateBoardBodySchema,
  createBoardBodySchema,
  updateBoardBodySchema,
  generateBoardResponseSchema,
  createBoardResponseSchema,
  updateBoardResponseSchema,
  listBoardsResponseSchema,
  deleteBoardResponseSchema,
  boardErrorResponseSchema,
  boardDocumentSchema,
  boardStateResponseSchema,
  assignableMembersResponseSchema,
  boardAiRequestBodySchema,
  boardAiResponseSchema,
} from '../schemas/boards.js';
import { chatThreadResponseSchema } from '../schemas/docs.js';

const c = initContract();

export const boardsContract = c.router(
  {
    /**
     * GET /api/boards
     * List all boards accessible to the authenticated user.
     */
    listBoards: {
      method: 'GET',
      path: '/api/boards',
      responses: {
        200: listBoardsResponseSchema,
        401: boardErrorResponseSchema,
        500: boardErrorResponseSchema,
      },
      summary: 'List all accessible boards',
    },

    /**
     * GET /api/boards/:id
     * Fetch a single board's metadata document.
     */
    getBoard: {
      method: 'GET',
      path: '/api/boards/:id',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: boardDocumentSchema,
        401: boardErrorResponseSchema,
        403: boardErrorResponseSchema,
        404: boardErrorResponseSchema,
        500: boardErrorResponseSchema,
      },
      summary: 'Fetch a board document',
    },

    /**
     * GET /api/boards/:id/state
     * Fetch the materialized board state (kanban fields/rows/views or whiteboard texts).
     */
    getBoardState: {
      method: 'GET',
      path: '/api/boards/:id/state',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: boardStateResponseSchema,
        401: boardErrorResponseSchema,
        404: boardErrorResponseSchema,
        500: boardErrorResponseSchema,
      },
      summary: 'Fetch board state',
    },

    /**
     * GET /api/boards/:id/assignable-members
     * List members that can be assigned to cards (owner + direct + group shares).
     */
    getAssignableMembers: {
      method: 'GET',
      path: '/api/boards/:id/assignable-members',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: assignableMembersResponseSchema,
        401: boardErrorResponseSchema,
        403: boardErrorResponseSchema,
        500: boardErrorResponseSchema,
      },
      summary: 'List assignable members',
    },

    /**
     * DELETE /api/boards/:id
     * Soft-delete a board (owner only).
     */
    deleteBoard: {
      method: 'DELETE',
      path: '/api/boards/:id',
      pathParams: z.object({ id: z.string() }),
      body: z.object({}),
      responses: {
        200: deleteBoardResponseSchema,
        401: boardErrorResponseSchema,
        403: boardErrorResponseSchema,
        404: boardErrorResponseSchema,
        500: boardErrorResponseSchema,
      },
      summary: 'Delete a board',
    },

    /**
     * POST /api/boards/generate
     * Generate a new board from a text description using AI.
     */
    generateBoard: {
      method: 'POST',
      path: '/api/boards/generate',
      body: generateBoardBodySchema,
      responses: {
        201: generateBoardResponseSchema,
        400: boardErrorResponseSchema,
        401: boardErrorResponseSchema,
        500: boardErrorResponseSchema,
      },
      summary: 'Generate a board from a description',
    },

    /**
     * POST /api/boards
     * Create a new board.
     */
    createBoard: {
      method: 'POST',
      path: '/api/boards',
      body: createBoardBodySchema,
      responses: {
        201: createBoardResponseSchema,
        401: boardErrorResponseSchema,
        500: boardErrorResponseSchema,
      },
      summary: 'Create a new board',
    },

    /**
     * POST /api/boards/:id/duplicate
     * Clone a board's structure (fields/rows/views + description) into a fresh
     * board. Relational tails (comments/attachments/activity) are NOT copied.
     * Returns the new board + its structure (client seeds it, like generateBoard).
     */
    duplicateBoard: {
      method: 'POST',
      path: '/api/boards/:id/duplicate',
      pathParams: z.object({ id: z.string() }),
      body: z.object({}),
      responses: {
        201: generateBoardResponseSchema,
        401: boardErrorResponseSchema,
        403: boardErrorResponseSchema,
        404: boardErrorResponseSchema,
        500: boardErrorResponseSchema,
      },
      summary: 'Duplicate a board',
    },

    /**
     * GET /api/boards/:id/chat-thread
     * Resolve (idempotently create) the shared chat thread for a board. One
     * thread per board, shared across collaborators — reuses chat_threads.doc_id
     * since a board is a collaborative_documents row.
     */
    getChatThread: {
      method: 'GET',
      path: '/api/boards/:id/chat-thread',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: chatThreadResponseSchema,
        401: boardErrorResponseSchema,
        403: boardErrorResponseSchema,
        404: boardErrorResponseSchema,
        500: boardErrorResponseSchema,
      },
      summary: 'Resolve the shared chat thread for a board',
    },

    /**
     * POST /api/boards/:id/ai
     * Turn a natural-language board-edit request into a list of board operations
     * (applied client-side by the boards assistant). Returns operations as JSON.
     */
    ai: {
      method: 'POST',
      path: '/api/boards/:id/ai',
      pathParams: z.object({ id: z.string() }),
      body: boardAiRequestBodySchema,
      responses: {
        200: boardAiResponseSchema,
        401: boardErrorResponseSchema,
        403: boardErrorResponseSchema,
        404: boardErrorResponseSchema,
        500: boardErrorResponseSchema,
      },
      summary: 'Generate board operations from a natural-language request',
    },

    /**
     * PUT /api/boards/:id
     * Update board title and/or archived status.
     */
    updateBoard: {
      method: 'PUT',
      path: '/api/boards/:id',
      pathParams: z.object({ id: z.string() }),
      body: updateBoardBodySchema,
      responses: {
        200: updateBoardResponseSchema,
        401: boardErrorResponseSchema,
        403: boardErrorResponseSchema,
        404: boardErrorResponseSchema,
        500: boardErrorResponseSchema,
      },
      summary: 'Update a board',
    },
  },
  { pathPrefix: '' }
);
