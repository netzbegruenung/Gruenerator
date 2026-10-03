import { z } from 'zod';

/**
 * Dauerhafte Werkzeug-Freigaben („immer erlauben") einer Person.
 *
 * `scopeKey` ist bewusst ein freier String und kein Enum: er benennt
 * `mcp:<serverId>/<tool>` bzw. `internal/<tool>` und wächst mit jedem
 * verbundenen Server, den niemand vorher kennt.
 */
/**
 * Die zwei bewussten Entscheidungen zu einem Werkzeug. Die dritte Stufe,
 * „Nachfragen", ist die Vorgabe und hat keine Zeile.
 */
export const chatToolDecisionSchema = z.enum(['allow', 'deny']);
export type ChatToolDecision = z.infer<typeof chatToolDecisionSchema>;

export const chatToolApprovalSchema = z.object({
  scopeKey: z.string(),
  toolLabel: z.string().nullable(),
  createdAt: z.string(),
  // Optional statt vorbelegt: ein älterer Client liest die Liste weiter.
  decision: chatToolDecisionSchema.optional(),
});

export const chatToolApprovalListResponseSchema = z.object({
  approvals: z.array(chatToolApprovalSchema),
});

export const chatToolApprovalRevokeBodySchema = z.object({
  scopeKey: z.string().min(1),
});

/**
 * Stufe eines Werkzeugs eines selbst verbundenen Servers aus den Einstellungen
 * setzen. Nur `mcp:`-Schlüssel: nur dieser Katalog liest `deny` (mcpCatalog),
 * und interne Werkzeuge haben eigene Rückfragen. `decision: null` löscht die
 * Zeile — zurück auf „Nachfragen".
 */
export const chatToolDecisionBodySchema = z.object({
  scopeKey: z
    .string()
    .min(1)
    .max(512)
    .regex(/^mcp:[^/]+\/.+$/),
  toolLabel: z.string().max(300).nullable(),
  decision: chatToolDecisionSchema.nullable(),
});

export const chatToolDecisionResponseSchema = z.object({
  scopeKey: z.string(),
  decision: chatToolDecisionSchema.nullable(),
});

export const chatToolApprovalRevokeResponseSchema = z.object({
  revoked: z.boolean(),
});

export const chatToolApprovalErrorResponseSchema = z.object({
  error: z.string(),
});

export type ChatToolApproval = z.infer<typeof chatToolApprovalSchema>;
