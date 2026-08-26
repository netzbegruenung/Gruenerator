/**
 * ts-rest-Router für die Sichtbarkeit von Grünerator-Agenten.
 *
 * `getVisibility` verlangt nur eine Anmeldung (am Präfix `/api/agents` in
 * routes.ts gesetzt). `list`/`setHidden` prüfen zusätzlich pro Handler auf
 * `is_admin` — dasselbe Muster wie skillVisibilityContractRouter, weil
 * `requireAuth` am Präfix `/api/auth/admin/agents` nur die Anmeldung abdeckt.
 */
import { agentVisibilityContract } from '@gruenerator/contracts';
import { getCuratableSystemAgents } from '@gruenerator/shared/agents';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { CURRENT_INSTANCE } from '../../config/instance.js';
import {
  clearHiddenAgentsCache,
  getHiddenAgentIdentifiers,
  hideAgent,
  unhideAgent,
} from '../../services/agents/AdminHiddenAgentsService.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('agentVisibilityContractRouter');

const FORBIDDEN = {
  status: 403 as const,
  body: { success: false, message: 'Keine Admin-Berechtigung.' },
};

const s = initServer();

export const agentVisibilityContractRouter = s.router(agentVisibilityContract, {
  getVisibility: async () => {
    try {
      const hiddenIdentifiers = await getHiddenAgentIdentifiers();
      return { status: 200 as const, body: { hiddenIdentifiers } };
    } catch (error) {
      log.error('[agentVisibilityContract.getVisibility] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Agenten-Sichtbarkeit.' },
      };
    }
  },

  list: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const hidden = new Set(await getHiddenAgentIdentifiers());
      const data = getCuratableSystemAgents(CURRENT_INSTANCE).map((agent) => ({
        identifier: agent.identifier,
        title: agent.title,
        slug: agent.slug ?? null,
        hidden: hidden.has(agent.identifier),
      }));

      return { status: 200 as const, body: { success: true, data } };
    } catch (error) {
      log.error('[agentVisibilityContract.list] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Agenten.' },
      };
    }
  },

  setHidden: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const { identifier } = args.params;
      if (args.body.hidden) {
        await hideAgent(identifier, authedUser.id);
      } else {
        await unhideAgent(identifier);
      }
      clearHiddenAgentsCache();

      log.info(
        `[agentVisibilityContract] ${identifier} ${args.body.hidden ? 'hidden' : 'unhidden'} by ${authedUser.id}`
      );
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[agentVisibilityContract.setHidden] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Ändern der Agenten-Sichtbarkeit.' },
      };
    }
  },
});

export function mountAgentVisibilityContractRouter(app: Application): void {
  createExpressEndpoints(agentVisibilityContract, agentVisibilityContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'agentVisibilityContract'),
  });
}
