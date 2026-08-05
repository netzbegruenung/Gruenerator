import { initContract } from '@ts-rest/core';

import { skillPromptResponseSchema, skillPromptErrorResponseSchema } from '../schemas/skill.js';

const c = initContract();

/**
 * Read access to a skill's party-internal prompt body.
 *
 * The recipe catalogue (`SKILLS`) ships in the client bundle and carries
 * metadata only; the prompt text is served here so it reaches authenticated
 * users without being published to everyone who can fetch a JS chunk. Mounted
 * behind `requireAuth` at the `/api/skills` prefix.
 */
export const skillPromptContract = c.router(
  {
    getPrompt: {
      method: 'GET',
      path: '/api/skills/:mention/prompt',
      responses: {
        200: skillPromptResponseSchema,
        401: skillPromptErrorResponseSchema,
        404: skillPromptErrorResponseSchema,
        500: skillPromptErrorResponseSchema,
      },
      summary: 'Get the internal prompt body of a system skill',
    },
  },
  { pathPrefix: '' }
);
