/**
 * ts-rest contract for the person's nuudel polls (created by the Grünerator in
 * the chat). Auth via `requireAuth` at the /api/auth/nuudel-polls prefix.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { nuudelPollErrorSchema, nuudelPollListResponseSchema } from '../schemas/nuudelPolls.js';

const c = initContract();

export const nuudelPollsContract = c.router({
  /** GET /api/auth/nuudel-polls — the person's polls from our table. */
  listPolls: {
    method: 'GET',
    path: '/api/auth/nuudel-polls',
    responses: {
      200: nuudelPollListResponseSchema,
      401: nuudelPollErrorSchema,
      500: nuudelPollErrorSchema,
    },
    summary: 'List the nuudel polls the Grünerator created for the account',
  },

  /**
   * DELETE /api/auth/nuudel-polls/:id — forget the poll. The Grünerator no
   * longer reads it; the poll stays on nuudel until it expires or is deleted there.
   */
  forgetPoll: {
    method: 'DELETE',
    path: '/api/auth/nuudel-polls/:id',
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: z.object({ success: z.literal(true) }),
      401: nuudelPollErrorSchema,
      404: nuudelPollErrorSchema,
      500: nuudelPollErrorSchema,
    },
    summary: 'Remove a nuudel poll from the account',
  },
});
