/**
 * ts-rest contract for /api/boards
 *
 * Covers the validateBody-guarded endpoints in boardsController.ts.
 * Read-only endpoints (GET) are left in the legacy Express router.
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
} from '../schemas/boards.js';

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
