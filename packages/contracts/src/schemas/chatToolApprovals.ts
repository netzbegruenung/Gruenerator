import { z } from 'zod';

/**
 * Dauerhafte Werkzeug-Freigaben („immer erlauben") einer Person.
 *
 * `scopeKey` ist bewusst ein freier String und kein Enum: er benennt
 * `mcp:<serverId>/<tool>` bzw. `internal/<tool>` und wächst mit jedem
 * verbundenen Server, den niemand vorher kennt.
 */
export const chatToolApprovalSchema = z.object({
  scopeKey: z.string(),
  toolLabel: z.string().nullable(),
  createdAt: z.string(),
});

export const chatToolApprovalListResponseSchema = z.object({
  approvals: z.array(chatToolApprovalSchema),
});

export const chatToolApprovalRevokeBodySchema = z.object({
  scopeKey: z.string().min(1),
});

export const chatToolApprovalRevokeResponseSchema = z.object({
  revoked: z.boolean(),
});

export const chatToolApprovalErrorResponseSchema = z.object({
  error: z.string(),
});

export type ChatToolApproval = z.infer<typeof chatToolApprovalSchema>;
