/**
 * ts-rest contract for /api/chat/tool-approvals.
 *
 * Nur Lesen und Widerrufen: erteilt wird eine dauerhafte Freigabe
 * ausschliesslich serverseitig beim Fortsetzen eines pausierten Zuges
 * (`approvalResume.ts`) — ein POST hier wäre eine zweite Tür zu derselben
 * Entscheidung, ohne den Aufruf zu kennen, um den es ging.
 */
import { initContract } from '@ts-rest/core';

import {
  chatToolApprovalListResponseSchema,
  chatToolApprovalRevokeBodySchema,
  chatToolApprovalRevokeResponseSchema,
  chatToolApprovalErrorResponseSchema,
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
  },
  { strictStatusCodes: true }
);
