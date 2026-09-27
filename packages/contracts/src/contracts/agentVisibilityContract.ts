/**
 * ts-rest-Vertrag für die Sichtbarkeit von Grünerator-Agenten.
 *
 * `getVisibility` steht jeder angemeldeten Person offen — jede
 * Entdeckungsfläche (Agentura, Seitenleiste, globale Suche, Board-Auswahl,
 * angeheftete Agenten im Chat) liest daraus, um die statische Agenten-Registry
 * zu filtern. `list`/`setHidden` sind admin-gesichert und bedienen den
 * Agenten-Reiter im Administrationsbereich.
 *
 * Ausblenden betrifft nur die Entdeckung: `getSystemAgent()` und
 * `/agents/<slug>` bleiben ungefiltert, ein geteilter Link löst also weiter auf
 * — dasselbe `hidden`-≠-`blocked`-Prinzip wie bei der Instanz-Politik.
 */
import { initContract } from '@ts-rest/core';

import {
  agentVisibilityResponseSchema,
  adminAgentListResponseSchema,
  adminAgentSuccessResponseSchema,
  adminAgentErrorResponseSchema,
  setAgentHiddenBodySchema,
} from '../schemas/adminAgents.js';

const c = initContract();

export const agentVisibilityContract = c.router(
  {
    /**
     * GET /api/agents/visibility
     * `identifier`, die ein Admin auf diesem Deployment ausgeblendet hat.
     */
    getVisibility: {
      method: 'GET',
      path: '/api/agents/visibility',
      responses: {
        200: agentVisibilityResponseSchema,
        401: adminAgentErrorResponseSchema,
        500: adminAgentErrorResponseSchema,
      },
      summary: 'Ausgeblendete Agenten dieses Deployments',
    },

    /**
     * GET /api/auth/admin/agents
     * Die Agenten, die diese Instanz führt, mit ihrem Sichtbarkeitsstand.
     */
    list: {
      method: 'GET',
      path: '/api/auth/admin/agents',
      responses: {
        200: adminAgentListResponseSchema,
        401: adminAgentErrorResponseSchema,
        403: adminAgentErrorResponseSchema,
        500: adminAgentErrorResponseSchema,
      },
      summary: 'Agenten dieser Instanz mit Sichtbarkeitsstand (Admin)',
    },

    /**
     * PATCH /api/auth/admin/agents/:identifier
     * Einen Agenten auf diesem Deployment aus der Entdeckung nehmen.
     */
    setHidden: {
      method: 'PATCH',
      path: '/api/auth/admin/agents/:identifier',
      body: setAgentHiddenBodySchema,
      responses: {
        200: adminAgentSuccessResponseSchema,
        401: adminAgentErrorResponseSchema,
        403: adminAgentErrorResponseSchema,
        500: adminAgentErrorResponseSchema,
      },
      summary: 'Agenten aus- oder einblenden (Admin)',
    },
  },
  { pathPrefix: '' }
);
