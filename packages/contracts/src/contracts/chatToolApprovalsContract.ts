/**
 * ts-rest contract for /api/chat/tool-approvals.
 *
 * Zwei Wege zu derselben Entscheidung: die Karte im Chat (`approvalResume.ts`,
 * dort kennt man den konkreten Aufruf) und die Stufen-Auswahl pro Werkzeug in
 * den Konnektor-Einstellungen (`setDecision`, dort sieht man die Werkzeugliste).
 * Beide schreiben dieselbe Zeile.
 */
import { initContract } from '@ts-rest/core';

import {
  chatToolApprovalListResponseSchema,
  chatToolApprovalRevokeBodySchema,
  chatToolApprovalRevokeResponseSchema,
  chatToolApprovalErrorResponseSchema,
  chatToolDecisionBodySchema,
  chatToolDecisionResponseSchema,
} from '../schemas/chatToolApprovals.js';

const c = initContract();

export const chatToolApprovalsContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/chat/tool-approvals',
      responses: {
        200: chatToolApprovalListResponseSchema,
        401: chatToolApprovalErrorResponseSchema,
        500: chatToolApprovalErrorResponseSchema,
      },
      summary: 'List the tools this user always allows',
    },

    revoke: {
      method: 'DELETE',
      path: '/api/chat/tool-approvals',
      body: chatToolApprovalRevokeBodySchema,
      responses: {
        200: chatToolApprovalRevokeResponseSchema,
        401: chatToolApprovalErrorResponseSchema,
        500: chatToolApprovalErrorResponseSchema,
      },
      summary: 'Revoke a standing tool approval',
    },

    setDecision: {
      method: 'PUT',
      path: '/api/chat/tool-approvals',
      body: chatToolDecisionBodySchema,
      responses: {
        200: chatToolDecisionResponseSchema,
        401: chatToolApprovalErrorResponseSchema,
        500: chatToolApprovalErrorResponseSchema,
      },
      summary: "Set a connector tool's stage: allow, deny, or ask (null)",
    },
  },
  { strictStatusCodes: true }
);
