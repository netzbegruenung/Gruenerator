import { skillPromptContract } from '@gruenerator/contracts';
import { SKILLS } from '@gruenerator/shared/agents';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getInternalSkillPrompt } from '../../services/skills/internalSkillPrompts.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('skillPromptContractRouter');

const s = initServer();

/** Only mentions that exist in the public catalogue are answerable. */
const KNOWN_MENTIONS = new Set<string>(SKILLS.map((skill) => skill.mention));

export const skillPromptContractRouter = s.router(skillPromptContract, {
  getPrompt: async (args) => {
    try {
      const { mention } = args.params;
      // Reject unknown mentions before touching the filesystem: `mention` is a
      // path segment, and the loader keys its cache by filename. A 404 here also
      // keeps the endpoint from confirming which internal files exist.
      if (!KNOWN_MENTIONS.has(mention)) {
        return { status: 404 as const, body: { error: 'Unknown skill' } };
      }
      return { status: 200 as const, body: { mention, prompt: getInternalSkillPrompt(mention) } };
    } catch (error) {
      log.error('[skillPromptContract.getPrompt] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to load skill prompt' } };
    }
  },
});

export function mountSkillPromptContractRouter(app: Application): void {
  createExpressEndpoints(skillPromptContract, skillPromptContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'skillPromptContract'),
  });
}
